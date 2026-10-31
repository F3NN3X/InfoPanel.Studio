// One device's session: the supervised task `run` keeps a connection to the app while the device is in the registry and
// the connection is on. A connection says hello, asks to be trusted when the app wants that (once per connection, and
// only when the pairing allows: see `Pairing`), sends its capabilities, then opens the device on the app's list by its
// app id, else by its name (adopting a device the user already has), else creates it, and follows its context and
// icons. A dropped connection starts over after a backoff (1 s doubling to 30 s); an app that isn't running is looked
// for every 5 s. A key held down when a connection drops is not released here: the press ends with the app's session.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{mpsc, oneshot, Mutex as AsyncMutex};

use super::client::{Conn, ConnectError};
use super::proto::{self, client_message::Payload as C, server_message::Payload as S};
use super::settings::{clamp_grid, Device};
use super::{PageTo, Status, StreamDeck};

const BACKOFF_MIN: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(30);
const ABSENT_POLL: Duration = Duration::from_secs(5);

/// What the routes ask a session to do.
pub(super) enum Cmd {
    Press {
        index: u32,
        down: bool,
    },
    Page(PageTo),
    /// Apply the stored grid's `cols` and `rows`.
    Grid {
        cols: u32,
        rows: u32,
    },
    /// The stored name changed: replace the app's device with one of the new name.
    Rename,
    /// Delete the app's device; answered once that is sent.
    Forget(oneshot::Sender<()>),
}

/// How a connection ended.
enum End {
    Absent,
    /// Connect again at once (renamed before the device was open).
    Again,
    Forgotten,
    Failed {
        message: String,
        opened: bool,
    },
}

/// Keeps a connection for the device `id` until the task is stopped.
pub(super) async fn run(
    deck: Arc<StreamDeck>,
    id: String,
    cmds: Arc<AsyncMutex<mpsc::Receiver<Cmd>>>,
) {
    let mut cmds = cmds.lock().await;
    let mut backoff = BACKOFF_MIN;
    loop {
        let end = match deck.endpoint.port() {
            Some(port) => connection(&deck, &id, port, &mut cmds).await,
            None => End::Absent,
        };
        let wait = match end {
            End::Again => continue,
            End::Absent => {
                deck.set_status(&id, Status::Absent, None);
                ABSENT_POLL
            }
            End::Forgotten => BACKOFF_MIN,
            End::Failed { message, opened } => {
                if opened {
                    backoff = BACKOFF_MIN;
                }
                deck.set_status(&id, Status::Error, Some(message));
                let wait = backoff;
                backoff = (backoff * 2).min(BACKOFF_MAX);
                wait
            }
        };
        pause(wait, &mut cmds).await;
    }
}

/// Waits `wait` between connections; a forget meanwhile is answered at once (there is no device open to delete).
async fn pause(wait: Duration, cmds: &mut mpsc::Receiver<Cmd>) {
    let until = tokio::time::sleep(wait);
    tokio::pin!(until);
    loop {
        tokio::select! {
            _ = &mut until => return,
            cmd = cmds.recv() => match cmd {
                Some(Cmd::Forget(ack)) => {
                    let _ = ack.send(());
                }
                Some(_) => {}
                None => {
                    until.await;
                    return;
                }
            },
        }
    }
}

/// A device's grid, brought into 1 to 8 per side before it is sent (the app drops the connection otherwise).
fn grid_of(device: &Device) -> (u32, u32) {
    (
        clamp_grid(device.cols.into()),
        clamp_grid(device.rows.into()),
    )
}

fn failed(message: impl Into<String>, opened: bool) -> End {
    End::Failed {
        message: message.into(),
        opened,
    }
}

/// The open or create waiting for its answer.
struct Pending {
    request: u32,
    open: bool,
    name: String,
    /// The grid it was sent with.
    grid: (u32, u32),
}

struct Session<'a> {
    deck: &'a Arc<StreamDeck>,
    id: &'a str,
    conn: Conn,
    /// The per-connection request counter; 0 is the pairing's.
    requests: u32,
    auth_sent: bool,
    paired: bool,
    /// The app's device list, as last sent.
    list: Vec<proto::VirtualDevice>,
    pending: Option<Pending>,
    /// The device is open.
    opened: bool,
    /// It was open at some point of this connection (a later failure starts the backoff over).
    was_opened: bool,
}

async fn connection(
    deck: &Arc<StreamDeck>,
    id: &str,
    port: u16,
    cmds: &mut mpsc::Receiver<Cmd>,
) -> End {
    let Some((secret, public)) = deck.keys() else {
        return failed("The Stream Deck connection has no key yet.", false);
    };
    let mut conn = match Conn::connect(port, &public).await {
        Ok(conn) => conn,
        Err(ConnectError::Refused) => return End::Absent,
        Err(ConnectError::Failed(message)) => return failed(message, false),
    };
    // Only once the app answers, so an absent app's state doesn't flicker with every look.
    deck.set_status(id, Status::Connecting, None);
    let hello = match conn.server_hello(&secret).await {
        Ok(hello) => hello,
        Err(message) => return failed(message, false),
    };
    let mut session = Session {
        deck,
        id,
        conn,
        requests: 0,
        auth_sent: false,
        paired: !hello.needs_auth,
        list: Vec::new(),
        pending: None,
        opened: false,
        was_opened: false,
    };
    let end = match session.drive(cmds).await {
        Ok(()) => End::Forgotten,
        Err(end) => end,
    };
    if session.auth_sent && !session.paired {
        deck.abandon_pair(id);
    }
    session.conn.close().await;
    end
}

impl Session<'_> {
    async fn send(&mut self, payload: C) -> Result<(), End> {
        let opened = self.was_opened;
        self.conn
            .send(&proto::client(payload))
            .await
            .map_err(|message| failed(message, opened))
    }

    fn next_request(&mut self) -> u32 {
        self.requests += 1;
        self.requests
    }

    async fn drive(&mut self, cmds: &mut mpsc::Receiver<Cmd>) -> Result<(), End> {
        let mut pair_kick = self.deck.pair_kick.subscribe();
        if self.paired {
            self.send(C::ClientCapabilities(proto::ClientCapabilities {
                is_user_pro: false,
            }))
            .await?;
        } else {
            self.deck.set_status(self.id, Status::Pairing, None);
            self.try_authenticate().await?;
        }
        loop {
            tokio::select! {
                incoming = self.conn.recv() => {
                    match incoming {
                        Ok(Some(message)) => self.handle(message).await?,
                        Ok(None) => {}
                        Err(message) => return Err(failed(message, self.was_opened)),
                    }
                }
                _ = pair_kick.changed(), if !self.paired && !self.auth_sent => self.try_authenticate().await?,
                cmd = cmds.recv() => {
                    let Some(cmd) = cmd else { return Ok(()) };
                    self.command(cmd).await?;
                }
            }
        }
    }

    /// Asks the app to trust us, when the pairing lets this session ask.
    async fn try_authenticate(&mut self) -> Result<(), End> {
        if self.auth_sent || !self.deck.claim_pair(self.id) {
            return Ok(());
        }
        self.auth_sent = true;
        self.send(C::Authenticate(proto::Authenticate { request_id: 0 }))
            .await
    }

    async fn handle(&mut self, message: S) -> Result<(), End> {
        let pending = self.pending.as_ref().map(|p| p.request);
        match message {
            S::Ok(ok) if ok.request_id == 0 && self.auth_sent && !self.paired => {
                self.paired = true;
                self.deck.pair_answered(self.id, true);
                if !self.opened {
                    self.deck.set_status(self.id, Status::Connecting, None);
                }
                self.send(C::ClientCapabilities(proto::ClientCapabilities {
                    is_user_pro: false,
                }))
                .await?;
            }
            S::Error(e) if e.request_id == 0 && self.auth_sent && !self.paired => {
                self.deck.pair_answered(self.id, false);
                return Err(failed(
                    "The Stream Deck app didn't trust InfoPanel Studio. Press Pair to ask again.",
                    false,
                ));
            }
            S::VirtualDeviceList(list) => {
                self.list = list.devices;
                if !self.opened && self.pending.is_none() {
                    self.open_device().await?;
                }
            }
            S::VirtualDeviceOpened(opened) if pending == Some(opened.request_id) => {
                let Some(pending) = self.pending.take() else {
                    return Ok(());
                };
                let app_id = opened.device.map(|d| d.id).unwrap_or_default();
                self.deck.opened(self.id, &pending.name, &app_id);
                self.opened = true;
                self.was_opened = true;
                // An existing device keeps the layout it was created with until it is told otherwise, and the grid may
                // have changed while the device was being opened.
                if let Some(device) = self.deck.device(self.id) {
                    let grid = grid_of(&device);
                    if pending.open || grid != pending.grid {
                        self.send(C::UpdateKeypadConfig(proto::keypad_update(grid.0, grid.1)))
                            .await?;
                    }
                }
                self.deck.set_status(self.id, Status::Ready, None);
            }
            S::Error(e) if pending == Some(e.request_id) => {
                let open = self.pending.take().is_some_and(|p| p.open);
                if !open {
                    return Err(failed(
                        format!("The Stream Deck app refused the device: {}", e.reason),
                        false,
                    ));
                }
                // The device the app had is gone: make a new one.
                self.create().await?;
            }
            S::Context(context) => self.deck.context(self.id, &context),
            S::ContextUpdate(update) => self.deck.context_update(self.id, &update),
            S::Icon(icon) => self.deck.set_icon(self.id, &icon),
            _ => {}
        }
        Ok(())
    }

    /// Opens the device by its app id, else by its name, else creates it.
    async fn open_device(&mut self) -> Result<(), End> {
        let Some(device) = self.deck.device(self.id) else {
            return Ok(());
        };
        let by_id = self
            .list
            .iter()
            .find(|d| !device.app_id.is_empty() && d.id == device.app_id);
        let Some(found) = by_id.or_else(|| self.list.iter().find(|d| d.name == device.name)) else {
            return self.create().await;
        };
        let device_id = found.id.clone();
        let request = self.next_request();
        let grid = grid_of(&device);
        self.pending = Some(Pending {
            request,
            open: true,
            name: device.name,
            grid,
        });
        let keypad = proto::keypad_config(grid.0, grid.1);
        self.send(C::OpenVirtualDevice(proto::OpenVirtualDevice {
            request_id: request,
            device_id,
            keypad_config: Some(keypad),
        }))
        .await
    }

    async fn create(&mut self) -> Result<(), End> {
        let Some(device) = self.deck.device(self.id) else {
            return Ok(());
        };
        let request = self.next_request();
        let grid = grid_of(&device);
        self.pending = Some(Pending {
            request,
            open: false,
            name: device.name.clone(),
            grid,
        });
        let keypad = proto::keypad_config(grid.0, grid.1);
        self.send(C::CreateVirtualDevice(proto::CreateVirtualDevice {
            request_id: request,
            name: device.name,
            keypad_config: Some(keypad),
            skip_uniqueness_of_name_validation: true,
        }))
        .await
    }

    async fn command(&mut self, cmd: Cmd) -> Result<(), End> {
        match cmd {
            Cmd::Press { index, down } if self.opened => {
                self.send(C::KeyPress(proto::KeyPress {
                    index,
                    pressed: down,
                }))
                .await
            }
            Cmd::Page(to) if self.opened => {
                let payload = match to {
                    PageTo::Next => C::NextPage(proto::NextPage {}),
                    PageTo::Prev => C::PreviousPage(proto::PreviousPage {}),
                    PageTo::Index(index) => C::PageByIndex(proto::PageByIndex { index }),
                };
                self.send(payload).await
            }
            Cmd::Grid { cols, rows } if self.opened => {
                self.send(C::UpdateKeypadConfig(proto::keypad_update(
                    clamp_grid(cols.into()),
                    clamp_grid(rows.into()),
                )))
                .await
            }
            // DeleteVirtualDevice deletes the device the session has open, so the old one goes first, then the new
            // name is created. A device that isn't open yet is opened under the new name on a fresh connection.
            Cmd::Rename if self.opened => {
                self.send(C::DeleteVirtualDevice(proto::DeleteVirtualDevice {}))
                    .await?;
                self.opened = false;
                self.deck.set_status(self.id, Status::Connecting, None);
                self.create().await
            }
            Cmd::Rename => Err(End::Again),
            Cmd::Forget(ack) => {
                if self.opened {
                    self.send(C::DeleteVirtualDevice(proto::DeleteVirtualDevice {}))
                        .await?;
                }
                let _ = ack.send(());
                Err(End::Forgotten)
            }
            _ => Ok(()),
        }
    }
}
