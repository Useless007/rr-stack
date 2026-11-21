#![allow(clippy::unwrap_used)] // integration-test helpers sit outside #[test] fns, which allow-unwrap-in-tests does not cover

mod common;

use axum::http::{Method, StatusCode};
use common::{call, cookie_pair, sign_up};
use serde_json::json;
use sqlx::PgPool;

const PW: &str = "correct horse battery";

#[sqlx::test]
async fn register_sets_a_safe_session_cookie_and_me_works(db: PgPool) {
    let res = call(
        &db,
        Method::POST,
        "/api/auth/register",
        Some(json!({ "email": " Ada@Example.com ", "password": PW })),
        None,
    )
    .await;
    assert_eq!(res.status, StatusCode::CREATED);
    assert_eq!(
        res.body["email"], "ada@example.com",
        "email is trimmed and lowercased"
    );
    assert!(
        res.body.get("password_hash").is_none(),
        "hash never leaves the server"
    );
    let set_cookie = res.set_cookie.unwrap();
    for attr in ["HttpOnly", "SameSite=Lax", "Path=/"] {
        assert!(
            set_cookie.contains(attr),
            "cookie lacks {attr}: {set_cookie}"
        );
    }
    let me = call(
        &db,
        Method::GET,
        "/api/auth/me",
        None,
        Some(&cookie_pair(&set_cookie)),
    )
    .await;
    assert_eq!(me.status, StatusCode::OK);
    assert_eq!(me.body["email"], "ada@example.com");
}

#[sqlx::test]
async fn me_without_a_session_is_json_401(db: PgPool) {
    let res = call(&db, Method::GET, "/api/auth/me", None, None).await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    assert_eq!(res.body["error"], "unauthorized");
    let res = call(
        &db,
        Method::GET,
        "/api/auth/me",
        None,
        Some("rr_session=forged"),
    )
    .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn login_checks_the_password_and_does_not_reveal_which_part_was_wrong(db: PgPool) {
    sign_up(&db, "bo@example.com").await;
    let ok = call(
        &db,
        Method::POST,
        "/api/auth/login",
        Some(json!({ "email": "BO@example.com", "password": PW })),
        None,
    )
    .await;
    assert_eq!(ok.status, StatusCode::OK);
    assert!(ok.set_cookie.is_some());

    let wrong_pw = call(
        &db,
        Method::POST,
        "/api/auth/login",
        Some(json!({ "email": "bo@example.com", "password": "not the password" })),
        None,
    )
    .await;
    let no_user = call(
        &db,
        Method::POST,
        "/api/auth/login",
        Some(json!({ "email": "nobody@example.com", "password": PW })),
        None,
    )
    .await;
    assert_eq!(wrong_pw.status, StatusCode::UNAUTHORIZED);
    assert_eq!(no_user.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        wrong_pw.body, no_user.body,
        "same answer whether or not the account exists"
    );
    assert!(wrong_pw.set_cookie.is_none());
}

#[sqlx::test]
async fn register_validates_and_rejects_duplicates(db: PgPool) {
    for (email, password) in [("not-an-email", PW), ("cy@example.com", "short")] {
        let res = call(
            &db,
            Method::POST,
            "/api/auth/register",
            Some(json!({ "email": email, "password": password })),
            None,
        )
        .await;
        assert_eq!(
            res.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{email} / {password}"
        );
    }
    sign_up(&db, "cy@example.com").await;
    let dup = call(
        &db,
        Method::POST,
        "/api/auth/register",
        Some(json!({ "email": "CY@example.com", "password": PW })),
        None,
    )
    .await;
    assert_eq!(dup.status, StatusCode::CONFLICT);
    assert_eq!(dup.body["error"], "conflict");
}

#[sqlx::test]
async fn logout_ends_the_session(db: PgPool) {
    let cookie = sign_up(&db, "di@example.com").await;
    let out = call(&db, Method::POST, "/api/auth/logout", None, Some(&cookie)).await;
    assert_eq!(out.status, StatusCode::NO_CONTENT);
    assert!(
        out.set_cookie.unwrap().contains("Max-Age=0"),
        "cookie is cleared in the browser"
    );
    let me = call(&db, Method::GET, "/api/auth/me", None, Some(&cookie)).await;
    assert_eq!(
        me.status,
        StatusCode::UNAUTHORIZED,
        "the old cookie no longer works"
    );
}

#[sqlx::test]
async fn sessions_are_stored_hashed_and_expire(db: PgPool) {
    let cookie = sign_up(&db, "ed@example.com").await;
    let token = cookie.split_once('=').unwrap().1.to_owned();
    let stored: Vec<String> = sqlx::query_scalar("SELECT token_hash FROM sessions")
        .fetch_all(&db)
        .await
        .unwrap();
    assert_eq!(stored.len(), 1);
    assert_ne!(
        stored[0], token,
        "the database never holds the raw session token"
    );

    sqlx::query("UPDATE sessions SET expires_at = now() - interval '1 second'")
        .execute(&db)
        .await
        .unwrap();
    let me = call(&db, Method::GET, "/api/auth/me", None, Some(&cookie)).await;
    assert_eq!(me.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn writes_need_a_session_and_only_the_owner_may_change_a_todo(db: PgPool) {
    let anon = call(
        &db,
        Method::POST,
        "/api/todos",
        Some(json!({ "title": "x" })),
        None,
    )
    .await;
    assert_eq!(anon.status, StatusCode::UNAUTHORIZED);

    let alice = sign_up(&db, "alice@example.com").await;
    let bob = sign_up(&db, "bob@example.com").await;
    let todo = call(
        &db,
        Method::POST,
        "/api/todos",
        Some(json!({ "title": "alice's" })),
        Some(&alice),
    )
    .await;
    assert_eq!(todo.status, StatusCode::CREATED);
    assert!(todo.body["owner_id"].is_i64());
    let uri = format!("/api/todos/{}", todo.body["id"]);

    let list = call(&db, Method::GET, "/api/todos", None, None).await;
    assert_eq!(list.status, StatusCode::OK, "reading stays public");

    let patch = call(
        &db,
        Method::PATCH,
        &uri,
        Some(json!({ "done": true })),
        Some(&bob),
    )
    .await;
    assert_eq!(patch.status, StatusCode::FORBIDDEN);
    assert_eq!(patch.body["error"], "forbidden");
    let del = call(&db, Method::DELETE, &uri, None, Some(&bob)).await;
    assert_eq!(del.status, StatusCode::FORBIDDEN);

    let own = call(
        &db,
        Method::PATCH,
        &uri,
        Some(json!({ "done": true })),
        Some(&alice),
    )
    .await;
    assert_eq!(own.status, StatusCode::OK);
}

#[sqlx::test]
async fn logout_from_another_site_is_refused(db: PgPool) {
    let cookie = sign_up(&db, "fa@example.com").await;
    let req = axum::http::Request::post("/api/auth/logout")
        .header(axum::http::header::COOKIE, &cookie)
        .header("sec-fetch-site", "cross-site")
        .body(axum::body::Body::empty())
        .unwrap();
    use tower::ServiceExt;
    let res = server::app(server::AppState::new(db.clone()), None)
        .oneshot(req)
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
    let me = call(&db, Method::GET, "/api/auth/me", None, Some(&cookie)).await;
    assert_eq!(
        me.status,
        StatusCode::OK,
        "the session survives a cross-site logout attempt"
    );
}

#[sqlx::test]
async fn expired_sessions_are_cleaned_up_on_the_next_sign_in(db: PgPool) {
    sign_up(&db, "ga@example.com").await;
    sqlx::query("UPDATE sessions SET expires_at = now() - interval '1 day'")
        .execute(&db)
        .await
        .unwrap();
    sign_up(&db, "gb@example.com").await;
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(left, 1, "only the live session remains");
}

#[sqlx::test]
async fn responses_carry_security_headers(db: PgPool) {
    use tower::ServiceExt;
    let req = axum::http::Request::get("/api/health")
        .body(axum::body::Body::empty())
        .unwrap();
    let res = server::app(server::AppState::new(db), None)
        .oneshot(req)
        .await
        .unwrap();
    let h = res.headers();
    assert_eq!(h["x-content-type-options"], "nosniff");
    assert_eq!(h["x-frame-options"], "DENY");
    assert_eq!(h["referrer-policy"], "strict-origin-when-cross-origin");
}

#[sqlx::test]
async fn too_many_sign_in_attempts_from_one_address_get_429(db: PgPool) {
    use axum::extract::ConnectInfo;
    use tower::ServiceExt;
    let mut state = server::AppState::new(db);
    state.sign_in_limit.limit = 10;
    let attempt = |ip: [u8; 4]| {
        let mut req = axum::http::Request::post("/api/auth/login")
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .body(axum::body::Body::from(
                json!({ "email": "x@example.com", "password": "wrong password" }).to_string(),
            ))
            .unwrap();
        req.extensions_mut()
            .insert(ConnectInfo(std::net::SocketAddr::from((ip, 1234))));
        server::app(state.clone(), None).oneshot(req)
    };
    for _ in 0..10 {
        assert_eq!(
            attempt([10, 0, 0, 1]).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
    }
    let blocked = attempt([10, 0, 0, 1]).await.unwrap();
    assert_eq!(blocked.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(blocked.headers().contains_key("retry-after"));
    assert_eq!(
        attempt([10, 0, 0, 2]).await.unwrap().status(),
        StatusCode::UNAUTHORIZED,
        "other addresses are not affected"
    );
}

/// The count is in the database: several server processes share it, so a client cannot get more
/// attempts by landing on a different one.
#[sqlx::test]
async fn the_sign_in_limit_counts_across_server_processes(db: PgPool) {
    use tower::ServiceExt;
    for i in 0..11 {
        // A new AppState per attempt stands in for a new server process.
        let req = axum::http::Request::post("/api/auth/login")
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .body(axum::body::Body::from(
                json!({ "email": "x@example.com", "password": "wrong password" }).to_string(),
            ))
            .unwrap();
        let mut state = server::AppState::new(db.clone());
        state.sign_in_limit.limit = 10;
        let status = server::app(state, None)
            .oneshot(req)
            .await
            .unwrap()
            .status();
        let want = if i < 10 {
            StatusCode::UNAUTHORIZED
        } else {
            StatusCode::TOO_MANY_REQUESTS
        };
        assert_eq!(status, want, "attempt {}", i + 1);
    }
}
