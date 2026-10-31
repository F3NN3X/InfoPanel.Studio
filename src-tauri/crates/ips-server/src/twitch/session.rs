// The chat connection: IRC over a WebSocket to Twitch, kept open while signed in. `chat_loop` is the supervised task;
// `session` is one connection. Twitch's PING is answered, RECONNECT and a dropped socket start over after a backoff, and a
// login Twitch refuses gets one token refresh before the user is signed out. The token goes into the PASS line and is
// never logged.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message as Ws;

use super::irc::{self, Event};
use super::{locked, Twitch};
use crate::config::now_ms;

const BACKOFF_MIN: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Twitch pings about every five minutes; a connection silent for longer than this is taken as dead.
const IDLE: Duration = Duration::from_secs(7 * 60);
const QUEUED_SENDS: usize = 8;

/// How a session ended.
#[derive(Debug, PartialEq)]
enum End {
    /// The sign-in or the channel changed: look at the state again.
    Kicked,
    /// Twitch asked for a new connection.
    Reconnect,
    AuthFailed,
    Closed(String),
}

impl Twitch {
    /// Keeps a chat session open while signed in.
    pub(super) async fn chat_loop(self: Arc<Self>) {
        let mut kick = self.kick.subscribe();
        let mut backoff = BACKOFF_MIN;
        let mut refreshed = false;
        loop {
            let (signed_in, login, channel) = {
                let i = locked(&self.inner);
                (i.signed_in(), i.auth.login.clone(), i.channel())
            };
            if !signed_in || channel.is_empty() {
                self.set_connected(false);
                let _ = kick.changed().await;
                continue;
            }
            let token = match self.access_token().await {
                Ok(token) => token,
                Err(message) => {
                    log::warn!(target: "server", "twitch chat: {message}");
                    self.pause(&mut kick, &mut backoff).await;
                    continue;
                }
            };
            let (end, welcomed) = self.session(&mut kick, &token, &login, &channel).await;
            self.set_connected(false);
            if welcomed {
                backoff = BACKOFF_MIN;
                refreshed = false;
            }
            match end {
                End::Kicked => {}
                End::Reconnect => {
                    // Twitch asked for a new connection, not for a stampede.
                    backoff = BACKOFF_MIN;
                    self.pause(&mut kick, &mut backoff).await;
                    backoff = BACKOFF_MIN;
                }
                End::AuthFailed if !refreshed => {
                    refreshed = true;
                    // The token Twitch refused is replaced; a refresh Twitch refuses too signs the user out.
                    if let Err(message) = self.refresh_stale(&token).await {
                        log::warn!(target: "server", "twitch chat: {message}");
                        self.pause(&mut kick, &mut backoff).await;
                    }
                }
                End::AuthFailed => self.signed_out("Twitch refused the sign-in. Sign in again."),
                End::Closed(message) => {
                    log::warn!(target: "server", "twitch chat: {message}");
                    self.pause(&mut kick, &mut backoff).await;
                }
            }
        }
    }

    /// Waits out the backoff (and doubles it); a kick ends the wait early and says so with false.
    async fn pause(&self, kick: &mut watch::Receiver<u64>, backoff: &mut Duration) -> bool {
        let wait = *backoff;
        *backoff = (*backoff * 2).min(BACKOFF_MAX);
        tokio::select! {
            _ = tokio::time::sleep(wait) => true,
            _ = kick.changed() => false,
        }
    }

    /// One connection. The flag says whether Twitch accepted the login.
    async fn session(
        &self,
        kick: &mut watch::Receiver<u64>,
        token: &str,
        login: &str,
        channel: &str,
    ) -> (End, bool) {
        let connect = tokio::time::timeout(
            CONNECT_TIMEOUT,
            tokio_tungstenite::connect_async(self.ep.irc.as_str()),
        );
        let mut socket = match connect.await {
            Ok(Ok((socket, _))) => socket,
            Ok(Err(e)) => return (End::Closed(format!("couldn't connect: {e}")), false),
            Err(_) => return (End::Closed("connecting timed out".into()), false),
        };
        let hello = [
            "CAP REQ :twitch.tv/tags twitch.tv/commands".to_string(),
            format!("PASS oauth:{token}"),
            format!("NICK {login}"),
            format!("JOIN #{channel}"),
        ];
        for line in hello {
            if socket.send(Ws::text(line)).await.is_err() {
                return (
                    End::Closed("the connection closed while logging in".into()),
                    false,
                );
            }
        }
        let (tx, mut sends) = mpsc::channel::<String>(QUEUED_SENDS);
        let mut welcomed = false;
        let end = loop {
            tokio::select! {
                _ = kick.changed() => break End::Kicked,
                text = sends.recv() => {
                    let Some(text) = text else { continue };
                    if socket.send(Ws::text(format!("PRIVMSG #{channel} :{text}"))).await.is_err() {
                        break End::Closed("the connection closed".into());
                    }
                    self.echo(&text);
                }
                incoming = tokio::time::timeout(IDLE, socket.next()) => {
                    let message = match incoming {
                        Err(_) => break End::Closed("the connection went quiet".into()),
                        Ok(None) | Ok(Some(Ok(Ws::Close(_)))) => break End::Closed("Twitch closed the connection".into()),
                        Ok(Some(Err(e))) => break End::Closed(format!("the connection failed: {e}")),
                        Ok(Some(Ok(message))) => message,
                    };
                    let Ws::Text(text) = message else {
                        if let Ws::Ping(data) = message {
                            let _ = socket.send(Ws::Pong(data)).await;
                        }
                        continue;
                    };
                    let mut over = None;
                    for raw in text.split("\r\n") {
                        let Some(line) = irc::parse_line(raw) else { continue };
                        match irc::event(&line, now_ms()) {
                            Event::Ping(reply) => {
                                let _ = socket.send(Ws::text(format!("PONG :{reply}"))).await;
                            }
                            Event::Welcome => {
                                welcomed = true;
                                *locked(&self.outgoing) = Some(tx.clone());
                                self.set_connected(true);
                            }
                            Event::Message(entry) => self.add(entry),
                            Event::ClearChat(user) => self.clear_chat(user.as_deref()),
                            Event::ClearMsg(id) => {
                                locked(&self.inner).window.remove(&id);
                                self.publish_chat();
                            }
                            Event::UserState(me) => locked(&self.inner).me = me,
                            Event::Reconnect => over = Some(End::Reconnect),
                            Event::AuthFailed => over = Some(End::AuthFailed),
                            Event::Other => {}
                        }
                    }
                    if let Some(over) = over {
                        break over;
                    }
                }
            }
        };
        let _ = socket.close(None).await;
        (end, welcomed)
    }

    fn clear_chat(&self, user: Option<&str>) {
        {
            let mut i = locked(&self.inner);
            match user {
                Some(login) => i.window.clear_user(login),
                None => i.window.clear_all(),
            }
        }
        self.publish_chat();
    }
}
