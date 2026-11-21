use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use serde::Serialize;
use tokio::sync::broadcast;
use utoipa::ToSchema;

use crate::AppState;
use crate::todos::Todo;

/// Pushed to every client connected to `GET /api/events` (WebSocket) when a todo changes.
#[derive(Clone, Serialize, ToSchema)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TodoEvent {
    Created { todo: Todo },
    Updated { todo: Todo },
    Deleted { id: i64 },
}

/// Fan-out of `TodoEvent`s; a slow client that falls behind skips events instead of blocking writers.
pub fn channel() -> broadcast::Sender<TodoEvent> {
    broadcast::channel(256).0
}

pub async fn events(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    let rx = state.events.subscribe();
    ws.on_upgrade(move |socket| forward(socket, rx))
}

async fn forward(mut socket: WebSocket, mut rx: broadcast::Receiver<TodoEvent>) {
    loop {
        let event = match rx.recv().await {
            Ok(event) => event,
            // Missed some events: the client refetches on any event, so carry on.
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => break,
        };
        let Ok(text) = serde_json::to_string(&event) else {
            continue;
        };
        if socket.send(Message::Text(text.into())).await.is_err() {
            break; // client went away
        }
    }
}
