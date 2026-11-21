#![allow(clippy::unwrap_used)] // integration-test helpers sit outside #[test] fns, which allow-unwrap-in-tests does not cover

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use serde_json::json;
use server::{AppState, app};
use sqlx::PgPool;
use tower::ServiceExt;

async fn post(db: &PgPool, cookie: &str, title: &str) -> common::Res {
    common::call(
        db,
        Method::POST,
        "/api/todos",
        Some(json!({ "title": title })),
        Some(cookie),
    )
    .await
}

#[sqlx::test]
async fn create_then_list(db: PgPool) {
    let me = common::sign_up(&db, "a@example.com").await;
    let created = post(&db, &me, "  buy milk  ").await;
    assert_eq!(created.status, StatusCode::CREATED);
    assert_eq!(created.body["title"], "buy milk");
    assert_eq!(created.body["done"], false);

    let todos = common::call(&db, Method::GET, "/api/todos", None, None)
        .await
        .body;
    assert_eq!(todos.as_array().map(Vec::len), Some(1));
    assert_eq!(todos[0]["id"], created.body["id"]);
}

#[sqlx::test]
async fn rejects_empty_and_blank(db: PgPool) {
    let me = common::sign_up(&db, "a@example.com").await;
    for title in ["", "   "] {
        assert_eq!(
            post(&db, &me, title).await.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "title {title:?}"
        );
    }
    assert_eq!(
        common::call(&db, Method::GET, "/api/todos", None, None)
            .await
            .body,
        json!([])
    );
}

#[sqlx::test]
async fn rejects_201_chars(db: PgPool) {
    let me = common::sign_up(&db, "a@example.com").await;
    assert_eq!(
        post(&db, &me, &"ก".repeat(201)).await.status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        post(&db, &me, &"ก".repeat(200)).await.status,
        StatusCode::CREATED,
        "200 Thai chars is 600 bytes and must pass"
    );
}

#[sqlx::test]
async fn unknown_api_path_is_json_404(db: PgPool) {
    for path in ["/api", "/api/", "/api/nope"] {
        let res = app(AppState::new(db.clone()), None)
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND, "{path}");
        let ct = res.headers()[header::CONTENT_TYPE].to_str().unwrap();
        assert!(
            ct.starts_with("application/json"),
            "{path} content-type {ct}"
        );
    }
}
