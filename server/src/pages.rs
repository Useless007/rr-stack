//! How the server answers paths that are not under /api.

use std::path::PathBuf;

use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::any,
};
use hyper_util::{
    client::legacy::{Client, connect::HttpConnector},
    rt::TokioExecutor,
};
use tower_http::services::{ServeDir, ServeFile};

/// `dist` is the React Router `build/client` dir in both modes.
pub enum Pages {
    /// `ssr: false`: prerendered files, and the SPA shell for every other path.
    Spa(PathBuf),
    /// `ssr: true`: files from `dist`, and every other path rendered by the React Router server
    /// at `upstream` (for example `http://127.0.0.1:3001`).
    Ssr { dist: PathBuf, upstream: String },
}

pub fn serve(router: Router, pages: Pages) -> Router {
    match pages {
        Pages::Spa(dist) => {
            let spa = ServeFile::new(dist.join("__spa-fallback.html"));
            router.fallback_service(ServeDir::new(dist).fallback(spa))
        }
        Pages::Ssr { dist, upstream } => {
            let render = any(proxy).with_state(Upstream::new(upstream));
            // Form posts to a page (React Router actions) must reach the renderer too.
            let files = ServeDir::new(dist).call_fallback_on_method_not_allowed(true);
            router.fallback_service(files.fallback(render))
        }
    }
}

#[derive(Clone)]
struct Upstream {
    client: Client<HttpConnector, Body>,
    base: String,
}

impl Upstream {
    fn new(base: String) -> Self {
        Self {
            client: Client::builder(TokioExecutor::new()).build_http(),
            base: base.trim_end_matches('/').to_owned(),
        }
    }
}

/// Forwards the request unchanged (method, headers, cookies, body) and streams the answer back.
async fn proxy(State(up): State<Upstream>, mut req: Request) -> Response {
    let path = req.uri().path_and_query().map_or("/", |p| p.as_str());
    let Ok(uri) = format!("{}{path}", up.base).parse::<Uri>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    *req.uri_mut() = uri;
    match up.client.request(req).await {
        Ok(res) => res.map(Body::new).into_response(),
        Err(err) => {
            tracing::error!(%err, upstream = %up.base, "page renderer unreachable");
            (StatusCode::BAD_GATEWAY, "The page renderer is not running.").into_response()
        }
    }
}
