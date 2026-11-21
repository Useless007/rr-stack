#![allow(clippy::unwrap_used)] // integration-test helpers sit outside #[test] fns, which allow-unwrap-in-tests does not cover

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use server::{AppState, app, openapi};
use sqlx::PgPool;
use tower::ServiceExt;

#[sqlx::test]
async fn health_ok(db: PgPool) {
    let res = app(AppState::new(db), None)
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body, json!({"status": "ok"}));
}

#[test]
fn openapi_lists_health() {
    let spec = serde_json::to_value(openapi()).unwrap();
    assert!(
        spec["paths"]["/api/health"].is_object(),
        "spec paths: {}",
        spec["paths"]
    );
}
