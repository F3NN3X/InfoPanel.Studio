// One VSD2 connection: a plain WebSocket to the app on this machine, one protobuf message per binary frame. The two
// hellos travel in the clear; every frame after them is boxed (crypto.rs). The app's WebSocket pings are answered by
// tungstenite.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use prost::Message as _;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::{self, Message as Ws};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use super::crypto::Channel;
use super::proto::{
    self, client_message::Payload as C, server_message::Payload as S, ClientMessage, ServerMessage,
};
use crypto_box::SecretKey;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// The app pings every 8 seconds or so; a connection silent for this long is taken as dead.
const IDLE: Duration = Duration::from_secs(30);
/// What we tell the app we are.
pub const CLIENT_NAME: &str = "InfoPanel Studio";
pub const PROTOCOL_VERSION: u32 = 2;

/// Why a connection could not be made.
#[derive(Debug, PartialEq)]
pub enum ConnectError {
    /// Nothing listens on the port: the app isn't running.
    Refused,
    Failed(String),
}

pub struct Conn {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    channel: Option<Channel>,
}

/// What the server's hello says.
pub struct Hello {
    pub needs_auth: bool,
}

impl Conn {
    /// Connects to the app on `port` and sends our hello with `public_key`.
    pub async fn connect(port: u16, public_key: &[u8]) -> Result<Self, ConnectError> {
        let url = format!("ws://127.0.0.1:{port}/");
        let ws = match tokio::time::timeout(
            CONNECT_TIMEOUT,
            tokio_tungstenite::connect_async(url.as_str()),
        )
        .await
        {
            Ok(Ok((ws, _))) => ws,
            Ok(Err(tungstenite::Error::Io(e)))
                if e.kind() == std::io::ErrorKind::ConnectionRefused =>
            {
                return Err(ConnectError::Refused)
            }
            Ok(Err(e)) => return Err(ConnectError::Failed(format!("couldn't connect: {e}"))),
            Err(_) => return Err(ConnectError::Failed("connecting timed out".into())),
        };
        let mut conn = Self { ws, channel: None };
        let hello = proto::client(C::Hello(proto::HelloFromClient {
            public_key: public_key.to_vec(),
            client_information: Some(proto::ClientInformation {
                name: CLIENT_NAME.into(),
                user_agent: format!("{CLIENT_NAME}/{}", env!("CARGO_PKG_VERSION")),
                protocol_version: PROTOCOL_VERSION,
                device_model: "PC".into(),
                os_name: std::env::consts::OS.into(),
                os_version: String::new(),
            }),
        }));
        conn.send(&hello).await.map_err(ConnectError::Failed)?;
        Ok(conn)
    }

    /// Reads the server's hello and keys the box from its public key and our `secret`.
    pub async fn server_hello(&mut self, secret: &SecretKey) -> Result<Hello, String> {
        let frame = self.recv_frame().await?;
        let message =
            ServerMessage::decode(&frame[..]).map_err(|e| format!("unreadable hello: {e}"))?;
        let Some(S::Hello(hello)) = message.payload else {
            return Err("the first message wasn't a hello".into());
        };
        self.channel =
            Some(Channel::new(&hello.public_key, secret).ok_or("the app's public key isn't one")?);
        Ok(Hello {
            needs_auth: hello.client_needs_authentication,
        })
    }

    pub async fn send(&mut self, message: &ClientMessage) -> Result<(), String> {
        let plain = message.encode_to_vec();
        let frame = match &self.channel {
            Some(channel) => channel.seal(&plain)?,
            None => plain,
        };
        self.ws
            .send(Ws::binary(frame))
            .await
            .map_err(|e| format!("the connection failed: {e}"))
    }

    /// The next message; `Ok(None)` for one this client doesn't read.
    pub async fn recv(&mut self) -> Result<Option<S>, String> {
        let frame = self.recv_frame().await?;
        let plain = match &self.channel {
            Some(channel) => channel.open(&frame).ok_or("a frame that doesn't open")?,
            None => frame,
        };
        let message =
            ServerMessage::decode(&plain[..]).map_err(|e| format!("an unreadable message: {e}"))?;
        Ok(message.payload)
    }

    async fn recv_frame(&mut self) -> Result<Vec<u8>, String> {
        loop {
            let next = tokio::time::timeout(IDLE, self.ws.next()).await;
            match next {
                Err(_) => return Err("the connection went quiet".into()),
                Ok(None) | Ok(Some(Ok(Ws::Close(_)))) => {
                    return Err("the Stream Deck app closed the connection".into())
                }
                Ok(Some(Err(e))) => return Err(format!("the connection failed: {e}")),
                Ok(Some(Ok(Ws::Binary(frame)))) => return Ok(frame.to_vec()),
                // Pings are answered by tungstenite; nothing else carries meaning.
                Ok(Some(Ok(_))) => {}
            }
        }
    }

    pub async fn close(mut self) {
        let _ = self.ws.close(None).await;
    }
}

/// The client's frames as the app reads them, for the tests' fake app.
#[cfg(test)]
pub(super) fn open_frame(channel: &Channel, frame: &[u8]) -> Option<ClientMessage> {
    ClientMessage::decode(&channel.open(frame)?[..]).ok()
}

#[cfg(test)]
pub(super) fn seal_message(channel: &Channel, message: &ServerMessage) -> Vec<u8> {
    channel.seal(&message.encode_to_vec()).unwrap()
}
