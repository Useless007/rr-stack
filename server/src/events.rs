use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use serde::Serialize;
use sqlx::PgPool;
use sqlx::postgres::PgListener;
use tokio::sync::{OnceCell, broadcast};
use utoipa::ToSchema;

use crate::todos::Todo;
use crate::{AppError, AppState};

/// Pushed to every client connected to `GET /api/events` (WebSocket) when a todo changes.
///
/// The channel is public because reading todos is public. If you make data private to its owner,
/// filter events per user here and check the `Origin` header in `events()`, or every visitor (and
/// any other website) will receive everyone's changes.
#[derive(Clone, Serialize, ToSchema)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TodoEvent {
    Created { todo: Todo },
    Updated { todo: Todo },
    Deleted { id: i64 },
}

/// The Postgres channel every server process publishes to and listens on.
const CHANNEL: &str = "todo_events";

/// Tells every server process connected to this database, and through them every open page.
/// A failure is logged, not returned: the change itself is already saved, and an error here would
/// make the client retry a write that succeeded.
pub async fn publish(db: &PgPool, event: &TodoEvent) {
    // NOTIFY payloads must stay under 8000 bytes; a todo (title of 200 characters at most) does.
    let sent = match serde_json::to_string(event) {
        Ok(payload) => sqlx::query!("SELECT pg_notify($1, $2)", CHANNEL, payload)
            .execute(db)
            .await
            .map(|_| ()),
        Err(err) => Err(sqlx::Error::Encode(err.into())),
    };
    if let Err(err) = sent {
        tracing::warn!("could not publish a todo event: {err}");
    }
}

#[derive(Clone)]
enum Relayed {
    Event(Arc<str>),
    /// The listener lost its connection, so events may have been missed: clients must refetch.
    Resync,
}

/// This process's side of `LISTEN`: one database connection, fanned out to every WebSocket.
/// A slow client that falls behind skips events instead of blocking the others.
pub struct Hub {
    tx: broadcast::Sender<Relayed>,
    started: OnceCell<()>,
}

impl Hub {
    pub fn new() -> Self {
        Self {
            tx: broadcast::channel(256).0,
            started: OnceCell::new(),
        }
    }

    /// Starts listening on first use (a process with no open pages holds no extra connection).
    /// Returns only once `LISTEN` is active, so no event published after this is missed.
    async fn subscribe(&self, db: &PgPool) -> Result<broadcast::Receiver<Relayed>, sqlx::Error> {
        self.started
            .get_or_try_init(|| async {
                let mut listener = PgListener::connect_with(db).await?;
                listener.listen(CHANNEL).await?;
                tokio::spawn(relay(listener, self.tx.clone()));
                Ok::<_, sqlx::Error>(())
            })
            .await?;
        Ok(self.tx.subscribe())
    }
}

impl Default for Hub {
    fn default() -> Self {
        Self::new()
    }
}

async fn relay(mut listener: PgListener, tx: broadcast::Sender<Relayed>) {
    loop {
        // `try_recv` reports a lost connection as `Ok(None)` and reconnects on the next call.
        match listener.try_recv().await {
            Ok(Some(n)) => {
                let _ = tx.send(Relayed::Event(n.payload().into()));
            }
            Ok(None) => {
                tracing::warn!("event listener reconnecting; open pages will refetch");
                let _ = tx.send(Relayed::Resync);
            }
            Err(err) => {
                tracing::warn!("event listener: {err}; retrying in 1 s");
                let _ = tx.send(Relayed::Resync);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
}

pub async fn events(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let rx = state.events.subscribe(&state.db).await?;
    Ok(ws.on_upgrade(move |socket| forward(socket, rx)))
}

async fn forward(mut socket: WebSocket, mut rx: broadcast::Receiver<Relayed>) {
    loop {
        tokio::select! {
            relayed = rx.recv() => {
                let text = match relayed {
                    Ok(Relayed::Event(text)) => text,
                    // Closing makes the page reconnect, and it refetches after a reconnect.
                    Ok(Relayed::Resync) | Err(broadcast::error::RecvError::Closed) => break,
                    // Missed some events: the client refetches on any event, so carry on.
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                };
                if socket.send(Message::Text(text.as_ref().into())).await.is_err() {
                    break;
                }
            }
            // Reading the socket is how a closed tab is noticed right away, not at the next event.
            incoming = socket.recv() => match incoming {
                None | Some(Err(_)) | Some(Ok(Message::Close(_))) => break,
                Some(Ok(_)) => {}
            },
        }
    }
}
