// One device's session: the supervised task `run` keeps a connection to the app while the device is in the registry and
// the connection is on. A connection says hello, asks to be trusted when the app wants that (once per connection, and
// only when the pairing allows: see `Pairing`), sends its capabilities, then opens the device on the app's list by its
// app id, else by its name (adopting a device the user already has), else creates it, and follows its context and
// icons. An open or create the app doesn't answer within 10 s counts as a failed attempt. A dropped connection starts
// over after a backoff (1 s doubling to 30 s); an app that isn't running is looked for every 5 s. A key held down when
// a connection drops is not released here: the press ends with the app's session.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{mpsc, oneshot, Mutex as AsyncMutex};
use tokio::time::Instant;

use super::client::{Conn, ConnectError};
use super::proto::{self, client_message::Payload as C, server_message::Payload as S};
use super::settings::{clamp_grid, Device};
use super::{Forgot, PageTo, Status, StreamDeck};

const BACKOFF_MIN: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(30);
const ABSENT_POLL: Duration = Duration::from_secs(5);
/// How long an open or create may go unanswered.
const PENDING_TIMEOUT: Duration = if cfg!(test) {
    Duration::from_millis(500)
} else {
    Duration::from_secs(10)
};
/// How long a delete waits for the app to close the connection.
const DELETE_SETTLE: Duration = if cfg!(test) {
    Duration::from_millis(200)
} else {
    Duration::from_secs(3)
};

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
    /// The stored name changed: replace the app's device (`old_app_id`, "" when it had none yet) with one of the new
    /// name.
    Rename {
        old_app_id: String,
    },
    /// Delete the app's device; answered with what became of it.
    Forget(oneshot::Sender<Forgot>),
}

/// How a connection ended.
enum End {
    Absent,
    Forgotten,
    /// A device was deleted to be replaced (a rename): the app closes the connection, and the next one goes on.
    Replaced,
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
    // The app devices renames left behind, deleted on the next connection that sees them.
    let mut purge: Vec<String> = Vec::new();
    loop {
        let end = match deck.endpoint.port() {
            Some(port) => connection(&deck, &id, port, &mut cmds, &mut purge).await,
            None => End::Absent,
        };
        let wait = match end {
            End::Absent => {
                deck.set_status(&id, Status::Absent, None);
                ABSENT_POLL
            }
            End::Forgotten => BACKOFF_MIN,
            End::Replaced => {
                deck.set_status(&id, Status::Connecting, None);
                Duration::ZERO
            }
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
        pause(&deck, &id, wait, &mut cmds, &mut purge).await;
    }
}

/// Waits `wait` between connections. A forget meanwhile is answered at once (no device can be deleted now); a rename's
/// old device is kept for the next connection to delete.
async fn pause(
    deck: &StreamDeck,
    id: &str,
    wait: Duration,
    cmds: &mut mpsc::Receiver<Cmd>,
    purge: &mut Vec<String>,
) {
    let until = tokio::time::sleep(wait);
    tokio::pin!(until);
    loop {
        tokio::select! {
            _ = &mut until => return,
            cmd = cmds.recv() => match cmd {
                Some(Cmd::Forget(ack)) => {
                    let kept = deck.device(id).is_some_and(|d| !d.app_id.is_empty());
                    let _ = ack.send(if kept { Forgot::Kept } else { Forgot::Nothing });
                }
                Some(Cmd::Rename { old_app_id }) if !old_app_id.is_empty() => purge.push(old_app_id),
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

/// Gives up the pairing ask of a connection that ends any way at all, an aborted task included.
struct PairGuard<'a> {
    deck: &'a StreamDeck,
    id: &'a str,
}

impl Drop for PairGuard<'_> {
    fn drop(&mut self) {
        // A no-op unless this device's session holds the ask.
        self.deck.abandon_pair(self.id);
    }
}

/// What an open or create is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Purpose {
    Open,
    Create,
    /// Open a device only to delete it (a rename's old one, or a forgotten one).
    Purge,
}

/// The open or create waiting for its answer.
struct Pending {
    request: u32,
    purpose: Purpose,
    name: String,
    /// The grid it was sent with.
    grid: (u32, u32),
    deadline: Instant,
}

struct Session<'a> {
    deck: &'a Arc<StreamDeck>,
    id: &'a str,
    conn: Conn,
    /// The per-connection request counter; 0 is the pairing's.
    requests: u32,
    auth_sent: bool,
    paired: bool,
    /// The app's device list, as last sent, and whether one came.
    list: Vec<proto::VirtualDevice>,
    list_seen: bool,
    pending: Option<Pending>,
    purge: &'a mut Vec<String>,
    /// A forget waiting for the device to be opened so it can be deleted.
    forget: Option<oneshot::Sender<Forgot>>,
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
    purge: &mut Vec<String>,
) -> End {
    let _pair = PairGuard { deck, id };
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
    if hello.needs_auth {
        deck.needs_auth_seen();
    }
    let mut session = Session {
        deck,
        id,
        conn,
        requests: 0,
        auth_sent: false,
        paired: !hello.needs_auth,
        list: Vec::new(),
        list_seen: false,
        pending: None,
        purge,
        forget: None,
        opened: false,
        was_opened: false,
    };
    let end = match session.drive(cmds).await {
        Ok(()) => End::Forgotten,
        Err(end) => end,
    };
    session.conn.close().await;
    end
}

/// Sleeps until `deadline`, or forever without one.
async fn sleep_until(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
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
            let deadline = self.pending.as_ref().map(|p| p.deadline);
            tokio::select! {
                incoming = self.conn.recv() => {
                    match incoming {
                        Ok(Some(message)) => self.handle(message).await?,
                        Ok(None) => {}
                        Err(message) => return Err(failed(message, self.was_opened)),
                    }
                }
                _ = pair_kick.changed(), if !self.paired && !self.auth_sent => self.try_authenticate().await?,
                _ = sleep_until(deadline) => {
                    if let Some(ack) = self.forget.take() {
                        let _ = ack.send(Forgot::Kept);
                    }
                    return Err(failed("The Stream Deck app didn't answer opening the device.", self.was_opened));
                }
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

    /// Ends the connection for a forget, saying what became of the app's device.
    fn forgotten(&mut self, forgot: Forgot) -> Result<(), End> {
        if let Some(ack) = self.forget.take() {
            let _ = ack.send(forgot);
        }
        Err(End::Forgotten)
    }

    /// Deletes the open device and waits for the app to close the connection, which it does once the device is gone.
    /// Closing first, or sending more, loses the delete (seen with the real app); the connection is over either way.
    async fn delete_open_device(&mut self) -> Result<(), End> {
        self.opened = false;
        self.send(C::DeleteVirtualDevice(proto::DeleteVirtualDevice {}))
            .await?;
        let until = Instant::now() + DELETE_SETTLE;
        while let Ok(Ok(_)) = tokio::time::timeout_at(until, self.conn.recv()).await {}
        Ok(())
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
                self.list_seen = true;
                if !self.opened && self.pending.is_none() {
                    if self.forget.is_some() {
                        return self.forget_unopened().await;
                    }
                    self.next_step().await?;
                }
            }
            S::VirtualDeviceOpened(opened) if pending == Some(opened.request_id) => {
                let Some(pending) = self.pending.take() else {
                    return Ok(());
                };
                if self.forget.is_some() {
                    self.delete_open_device().await?;
                    return self.forgotten(Forgot::Deleted);
                }
                if pending.purpose == Purpose::Purge {
                    self.delete_open_device().await?;
                    return Err(End::Replaced);
                }
                let device = self.deck.device(self.id);
                if device.as_ref().is_some_and(|d| d.name != pending.name) {
                    // Renamed while this was being opened: it is the old name's device, replaced like an open one.
                    self.delete_open_device().await?;
                    return Err(End::Replaced);
                }
                let app_id = opened.device.map(|d| d.id).unwrap_or_default();
                self.deck.opened(self.id, &pending.name, &app_id);
                self.opened = true;
                self.was_opened = true;
                // An existing device keeps the layout it was created with until it is told otherwise, and the grid may
                // have changed while the device was being opened.
                if let Some(device) = device {
                    let grid = grid_of(&device);
                    if pending.purpose == Purpose::Open || grid != pending.grid {
                        self.send(C::UpdateKeypadConfig(proto::keypad_update(grid.0, grid.1)))
                            .await?;
                    }
                }
                self.deck.set_status(self.id, Status::Ready, None);
            }
            S::Error(e) if pending == Some(e.request_id) => {
                let purpose = self.pending.take().map(|p| p.purpose);
                if self.forget.is_some() {
                    return self.forgotten(Forgot::Nothing);
                }
                match purpose {
                    // The device the app had is gone: make a new one, or there is nothing left to delete.
                    Some(Purpose::Open) => self.create().await?,
                    Some(Purpose::Purge) => self.next_step().await?,
                    _ => {
                        return Err(failed(
                            format!("The Stream Deck app refused the device: {}", e.reason),
                            false,
                        ))
                    }
                }
            }
            S::Context(context) => self.deck.context(self.id, &context),
            S::ContextUpdate(update) => self.deck.context_update(self.id, &update),
            S::Icon(icon) => self.deck.set_icon(self.id, &icon),
            _ => {}
        }
        Ok(())
    }

    /// Deletes the devices renames left behind that the app still lists, one at a time, then opens ours.
    async fn next_step(&mut self) -> Result<(), End> {
        while let Some(app_id) = self.purge.pop() {
            if self.list.iter().any(|d| d.id == app_id) {
                let name = self
                    .deck
                    .device(self.id)
                    .map(|d| d.name)
                    .unwrap_or_default();
                return self.open(app_id, Purpose::Purge, name).await;
            }
        }
        self.open_device().await
    }

    /// A forget of a device that isn't open: opened by its app id to be deleted, when the app lists it.
    async fn forget_unopened(&mut self) -> Result<(), End> {
        let device = self.deck.device(self.id);
        let app_id = device
            .as_ref()
            .map(|d| d.app_id.clone())
            .unwrap_or_default();
        if app_id.is_empty() || !self.list.iter().any(|d| d.id == app_id) {
            return self.forgotten(Forgot::Nothing);
        }
        let name = device.map(|d| d.name).unwrap_or_default();
        self.open(app_id, Purpose::Purge, name).await
    }

    /// Opens the device by its app id, else by its name (adopting the app's), else creates it.
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
        self.open(device_id, Purpose::Open, device.name).await
    }

    async fn open(&mut self, device_id: String, purpose: Purpose, name: String) -> Result<(), End> {
        let grid = self.deck.device(self.id).map_or((1, 1), |d| grid_of(&d));
        let request = self.next_request();
        self.pending = Some(Pending {
            request,
            purpose,
            name,
            grid,
            deadline: Instant::now() + PENDING_TIMEOUT,
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
            purpose: Purpose::Create,
            name: device.name.clone(),
            grid,
            deadline: Instant::now() + PENDING_TIMEOUT,
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
            // DeleteVirtualDevice deletes the device the session has open, so the old one goes first; the next
            // connection adopts the new name from the app's list or creates it.
            Cmd::Rename { .. } if self.opened => {
                self.delete_open_device().await?;
                Err(End::Replaced)
            }
            // Not open yet: an open under way for the old name is replaced once it answers, and the old device left
            // in the app is deleted before ours is opened.
            Cmd::Rename { old_app_id } => {
                if !old_app_id.is_empty() {
                    self.purge.push(old_app_id);
                }
                Ok(())
            }
            Cmd::Forget(ack) => {
                if self.opened {
                    self.delete_open_device().await?;
                    let _ = ack.send(Forgot::Deleted);
                    return Err(End::Forgotten);
                }
                self.forget = Some(ack);
                // An open under way answers first; without one, the app's list says what there is to delete.
                if self.pending.is_none() && self.list_seen {
                    return self.forget_unopened().await;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}
