#![allow(clippy::unwrap_used)] // integration-test helpers sit outside #[test] fns, which allow-unwrap-in-tests does not cover

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use rr_server::{AppState, app};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

async fn send(db: &PgPool, req: Request<Body>) -> Response {
    app(AppState { db: db.clone() }, None)
        .oneshot(req)
        .await
        .unwrap()
}

async fn json_body(res: Response) -> Value {
    serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap()
}

fn post(title: &str) -> Request<Body> {
    Request::post("/api/todos")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "title": title }).to_string()))
        .unwrap()
}

fn list() -> Request<Body> {
    Request::get("/api/todos").body(Body::empty()).unwrap()
}

#[sqlx::test]
async fn create_then_list(db: PgPool) {
    let res = send(&db, post("  buy milk  ")).await;
    assert_eq!(res.status(), StatusCode::CREATED);
    let created = json_body(res).await;
    assert_eq!(created["title"], "buy milk");
    assert_eq!(created["done"], false);

    let todos = json_body(send(&db, list()).await).await;
    assert_eq!(todos.as_array().map(Vec::len), Some(1));
    assert_eq!(todos[0]["id"], created["id"]);
}

#[sqlx::test]
async fn rejects_empty_and_blank(db: PgPool) {
    for title in ["", "   "] {
        let res = send(&db, post(title)).await;
        assert_eq!(
            res.status(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "title {title:?}"
        );
    }
    assert_eq!(json_body(send(&db, list()).await).await, json!([]));
}

#[sqlx::test]
async fn rejects_201_chars(db: PgPool) {
    let res = send(&db, post(&"ก".repeat(201))).await;
    assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let res = send(&db, post(&"ก".repeat(200))).await;
    assert_eq!(
        res.status(),
        StatusCode::CREATED,
        "200 Thai chars is 600 bytes and must pass"
    );
}

#[sqlx::test]
async fn unknown_api_path_is_json_404(db: PgPool) {
    let res = send(&db, Request::get("/api/nope").body(Body::empty()).unwrap()).await;
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
    let ct = res.headers()[header::CONTENT_TYPE].to_str().unwrap();
    assert!(ct.starts_with("application/json"), "content-type {ct}");
}
