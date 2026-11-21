#![allow(clippy::unwrap_used)] // integration-test helpers sit outside #[test] fns, which allow-unwrap-in-tests does not cover

use std::path::PathBuf;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use server::{AppState, Pages, app};
use sqlx::PgPool;
use tower::ServiceExt;

/// A build/client dir with one prerendered page, one asset and the SPA shell.
/// One dir per test: the tests run in parallel and would otherwise rewrite each other's files.
fn dist(test: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("rr-pages-{}-{test}", std::process::id()));
    std::fs::create_dir_all(dir.join("assets")).unwrap();
    std::fs::write(dir.join("index.html"), "prerendered home").unwrap();
    std::fs::write(dir.join("assets/app.js"), "asset").unwrap();
    std::fs::write(dir.join("__spa-fallback.html"), "spa shell").unwrap();
    dir
}

/// Stands in for the React Router server: answers with what it received.
async fn renderer() -> String {
    let echo = Router::new().fallback(|req: Request<Body>| async move {
        let cookie = req
            .headers()
            .get("cookie")
            .map(|v| v.to_str().unwrap().to_owned());
        let (parts, body) = req.into_parts();
        let body = String::from_utf8(body.collect().await.unwrap().to_bytes().to_vec()).unwrap();
        format!(
            "rendered {} {} cookie={cookie:?} body={body}",
            parts.method, parts.uri
        )
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(axum::serve(listener, echo).into_future());
    url
}

async fn get(app: Router, req: Request<Body>) -> (StatusCode, String) {
    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let body = res.into_body().collect().await.unwrap().to_bytes();
    (status, String::from_utf8(body.to_vec()).unwrap())
}

fn at(path: &str) -> Request<Body> {
    Request::get(path).body(Body::empty()).unwrap()
}

#[sqlx::test]
async fn spa_mode_serves_files_then_the_shell(db: PgPool) {
    let app = app(AppState::new(db), Some(Pages::Spa(dist("spa"))));
    assert_eq!(get(app.clone(), at("/")).await.1, "prerendered home");
    assert_eq!(get(app.clone(), at("/assets/app.js")).await.1, "asset");
    assert_eq!(get(app, at("/app/todos/7")).await.1, "spa shell");
}

#[sqlx::test]
async fn ssr_mode_sends_other_paths_to_the_renderer(db: PgPool) {
    let pages = Pages::Ssr {
        dist: dist("ssr"),
        upstream: renderer().await,
    };
    let app = app(AppState::new(db), Some(pages));

    // Built files still come straight from disk.
    assert_eq!(get(app.clone(), at("/")).await.1, "prerendered home");
    assert_eq!(get(app.clone(), at("/assets/app.js")).await.1, "asset");

    // Everything else is rendered, with the path, query and session cookie intact.
    let req = Request::get("/app/todos/7?tab=open")
        .header("cookie", "rr_session=abc")
        .body(Body::empty())
        .unwrap();
    let (status, body) = get(app.clone(), req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        r#"rendered GET /app/todos/7?tab=open cookie=Some("rr_session=abc") body="#
    );

    // Form posts reach page actions instead of a 405 from the file server.
    let post = Request::post("/app/todos")
        .body(Body::from("title=hi"))
        .unwrap();
    assert_eq!(
        get(app.clone(), post).await.1,
        "rendered POST /app/todos cookie=None body=title=hi"
    );

    // The API is never forwarded.
    let (status, body) = get(app, at("/api/nope")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body.contains("not_found"), "{body}");
}

#[sqlx::test]
async fn ssr_mode_without_a_renderer_is_a_502(db: PgPool) {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let upstream = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let app = app(
        AppState::new(db),
        Some(Pages::Ssr {
            dist: dist("down"),
            upstream,
        }),
    );
    assert_eq!(get(app, at("/app")).await.0, StatusCode::BAD_GATEWAY);
}
