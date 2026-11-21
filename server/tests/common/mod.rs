#![allow(clippy::unwrap_used, dead_code)] // shared by several test binaries; each uses a subset

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use server::{AppState, app};
use sqlx::PgPool;
use tower::ServiceExt;

pub struct Res {
    pub status: StatusCode,
    pub body: Value,
    pub set_cookie: Option<String>,
}

/// One request against the app. `cookie` is a `name=value` pair from an earlier response.
pub async fn call(
    db: &PgPool,
    method: Method,
    uri: &str,
    body: Option<Value>,
    cookie: Option<&str>,
) -> Res {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(c) = cookie {
        req = req.header(header::COOKIE, c);
    }
    let req = match body {
        Some(b) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    // A different client address per call: the sign-in limit (10 per minute per address, counted in
    // the database) is tested on its own and must not trip tests that sign up many users.
    static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
    let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let mut req = req;
    req.extensions_mut()
        .insert(axum::extract::ConnectInfo(std::net::SocketAddr::from((
            std::net::Ipv4Addr::from(0x0a00_0000 | n),
            1,
        ))));
    let res = app(AppState::new(db.clone()), None)
        .oneshot(req)
        .await
        .unwrap();
    let status = res.status();
    let set_cookie = res
        .headers()
        .get(header::SET_COOKIE)
        .map(|v| v.to_str().unwrap().to_owned());
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    Res {
        status,
        body: serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        set_cookie,
    }
}

/// Registers a user and returns the `name=value` session cookie to send with later requests.
pub async fn sign_up(db: &PgPool, email: &str) -> String {
    let res = call(
        db,
        Method::POST,
        "/api/auth/register",
        Some(json!({ "email": email, "password": "correct horse battery" })),
        None,
    )
    .await;
    assert_eq!(
        res.status,
        StatusCode::CREATED,
        "register {email}: {}",
        res.body
    );
    cookie_pair(&res.set_cookie.unwrap())
}

pub fn cookie_pair(set_cookie: &str) -> String {
    set_cookie.split(';').next().unwrap().to_owned()
}
