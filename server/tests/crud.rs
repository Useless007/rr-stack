#![allow(clippy::unwrap_used)] // integration-test helpers sit outside #[test] fns, which allow-unwrap-in-tests does not cover

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use server::{AppState, app};
use sqlx::PgPool;
use tower::ServiceExt;

async fn call(db: &PgPool, method: Method, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let req = Request::builder().method(method).uri(uri);
    let req = match body {
        Some(b) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let res: Response = app(AppState { db: db.clone() }, None)
        .oneshot(req)
        .await
        .unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn create(db: &PgPool, title: &str) -> i64 {
    let (status, todo) = call(
        db,
        Method::POST,
        "/api/todos",
        Some(json!({ "title": title })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    todo["id"].as_i64().unwrap()
}

fn titles(list: &Value) -> Vec<&str> {
    list.as_array()
        .unwrap()
        .iter()
        .map(|t| t["title"].as_str().unwrap())
        .collect()
}

#[sqlx::test]
async fn get_one_and_json_404(db: PgPool) {
    let id = create(&db, "ice").await;
    let (status, todo) = call(&db, Method::GET, &format!("/api/todos/{id}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(todo["title"], "ice");

    let (status, err) = call(&db, Method::GET, "/api/todos/999999", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(err["error"], "not_found");
    assert!(err["message"].is_string());
}

#[sqlx::test]
async fn bad_path_param_is_json_400(db: PgPool) {
    let (status, err) = call(&db, Method::GET, "/api/todos/abc", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(err["error"], "bad_request");
}

#[sqlx::test]
async fn invalid_title_is_json_422(db: PgPool) {
    let (status, err) = call(
        &db,
        Method::POST,
        "/api/todos",
        Some(json!({ "title": "  " })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(err["error"], "validation");
    assert!(
        err["message"].as_str().unwrap().contains("title"),
        "message: {}",
        err["message"]
    );
}

#[sqlx::test]
async fn patch_toggles_done_and_renames(db: PgPool) {
    let id = create(&db, "old").await;
    let uri = format!("/api/todos/{id}");
    let (status, todo) = call(&db, Method::PATCH, &uri, Some(json!({ "done": true }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(todo["done"], true);
    assert_eq!(todo["title"], "old", "fields not sent stay as they were");

    let (_, todo) = call(&db, Method::PATCH, &uri, Some(json!({ "title": " new " }))).await;
    assert_eq!(todo["title"], "new");
    assert_eq!(todo["done"], true);

    let (status, _) = call(&db, Method::PATCH, &uri, Some(json!({ "title": "" }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = call(
        &db,
        Method::PATCH,
        "/api/todos/999999",
        Some(json!({ "done": true })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn delete_then_gone(db: PgPool) {
    let id = create(&db, "bye").await;
    let uri = format!("/api/todos/{id}");
    let (status, _) = call(&db, Method::DELETE, &uri, None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(&db, Method::DELETE, &uri, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn list_filters_by_status_and_search(db: PgPool) {
    let a = create(&db, "ส่งน้ำแข็งรอบเช้า").await;
    create(&db, "Order cups").await;
    create(&db, "100% done?").await;
    call(
        &db,
        Method::PATCH,
        &format!("/api/todos/{a}"),
        Some(json!({ "done": true })),
    )
    .await;

    let (_, done) = call(&db, Method::GET, "/api/todos?status=done", None).await;
    assert_eq!(titles(&done), vec!["ส่งน้ำแข็งรอบเช้า"]);
    let (_, open) = call(&db, Method::GET, "/api/todos?status=open", None).await;
    assert_eq!(open.as_array().unwrap().len(), 2);
    let (_, found) = call(
        &db,
        Method::GET,
        "/api/todos?q=%E0%B8%99%E0%B9%89%E0%B8%B3%E0%B9%81%E0%B8%82%E0%B9%87%E0%B8%87",
        None,
    )
    .await;
    assert_eq!(titles(&found), vec!["ส่งน้ำแข็งรอบเช้า"], "Thai search");
    let (_, found) = call(&db, Method::GET, "/api/todos?q=CUPS", None).await;
    assert_eq!(titles(&found), vec!["Order cups"], "case-insensitive");
    let (_, found) = call(&db, Method::GET, "/api/todos?q=%25", None).await;
    assert_eq!(
        titles(&found),
        vec!["100% done?"],
        "% is a literal, not a wildcard"
    );

    let (status, err) = call(&db, Method::GET, "/api/todos?status=nope", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(err["error"], "bad_request");
}

#[sqlx::test]
async fn stats_count_open_and_done(db: PgPool) {
    let (_, empty) = call(&db, Method::GET, "/api/stats", None).await;
    assert_eq!(empty, json!({ "total": 0, "open": 0, "done": 0 }));
    let a = create(&db, "a").await;
    create(&db, "b").await;
    call(
        &db,
        Method::PATCH,
        &format!("/api/todos/{a}"),
        Some(json!({ "done": true })),
    )
    .await;
    let (_, stats) = call(&db, Method::GET, "/api/stats", None).await;
    assert_eq!(stats, json!({ "total": 2, "open": 1, "done": 1 }));
}
