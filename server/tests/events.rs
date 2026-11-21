#![allow(clippy::unwrap_used)] // integration-test helpers sit outside #[test] fns, which allow-unwrap-in-tests does not cover

mod common;

use axum::body::Body;
use axum::http::{Request, header};
use futures_util::StreamExt;
use serde_json::{Value, json};
use server::{AppState, app};
use sqlx::PgPool;
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;
use tower::ServiceExt;

/// Every change to a todo reaches open WebSocket clients as a typed event.
#[sqlx::test]
async fn changes_are_broadcast_to_websocket_clients(db: PgPool) {
    let state = AppState::new(db);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(axum::serve(listener, app(state.clone(), None)).into_future());

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/api/events"))
        .await
        .unwrap();

    let cookie = common::sign_up(&state.db, "live@example.com").await;
    let req = Request::post("/api/todos")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, cookie)
        .body(Body::from(json!({ "title": "live" }).to_string()))
        .unwrap();
    app(state.clone(), None).oneshot(req).await.unwrap();

    let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let Message::Text(text) = msg else {
        panic!("expected a text frame, got {msg:?}")
    };
    let event: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(event["type"], "created");
    assert_eq!(event["todo"]["title"], "live");
}

#[test]
fn todo_event_is_in_the_contract() {
    let spec = serde_json::to_value(server::openapi()).unwrap();
    assert!(
        spec["components"]["schemas"]["TodoEvent"].is_object(),
        "TodoEvent schema missing"
    );
}

/// Two server processes on one database (replicas, or Vercel instances): a change made through one
/// reaches pages connected to the other.
#[sqlx::test]
async fn a_change_on_one_server_reaches_clients_of_another(db: PgPool) {
    let watched = AppState::new(db.clone());
    let other = AppState::new(db);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(axum::serve(listener, app(watched, None)).into_future());
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/api/events"))
        .await
        .unwrap();

    let cookie = common::sign_up(&other.db, "elsewhere@example.com").await;
    let req = Request::post("/api/todos")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, cookie)
        .body(Body::from(
            json!({ "title": "from another server" }).to_string(),
        ))
        .unwrap();
    app(other, None).oneshot(req).await.unwrap();

    let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
        .await
        .expect("no event within 5 s")
        .unwrap()
        .unwrap();
    let Message::Text(text) = msg else {
        panic!("expected a text frame, got {msg:?}")
    };
    let event: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(event["todo"]["title"], "from another server");
}
