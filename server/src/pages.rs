//! How the server answers paths that are not under /api.

use std::{path::PathBuf, time::Duration};

use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{HeaderMap, Method, StatusCode, Uri, header},
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

/// Longer than any loader should take; a stuck renderer becomes a 504 instead of a hung request.
const RENDER_TIMEOUT: Duration = Duration::from_secs(30);

/// Checks `WEB_SSR_URL` once at startup, so a typo fails loudly instead of turning every page into a 502.
pub fn check_upstream(url: &str) -> Result<(), String> {
    let uri: Uri = url
        .parse()
        .map_err(|e| format!("WEB_SSR_URL {url:?}: {e}"))?;
    match (uri.scheme_str(), uri.authority()) {
        (Some("http"), Some(_)) if uri.path() == "/" || uri.path().is_empty() => Ok(()),
        _ => Err(format!(
            "WEB_SSR_URL {url:?} must look like http://host:port"
        )),
    }
}

/// Built files. A prerendered page is `about/index.html`: serve it at `/about` itself, the URL its
/// canonical link and the sitemap name, instead of redirecting to `/about/`.
fn files(dist: PathBuf) -> ServeDir {
    ServeDir::new(dist).redirect_to_trailing_slash(false)
}

pub fn serve(router: Router, pages: Pages) -> Router {
    match pages {
        Pages::Spa(dist) => {
            let shell = dist.join("__spa-fallback.html");
            if !shell.exists() {
                tracing::warn!(
                    "{} is missing: deep links will 404. Built with ssr: true? Set WEB_SSR_URL.",
                    shell.display()
                );
            }
            router.fallback_service(files(dist).fallback(ServeFile::new(shell)))
        }
        Pages::Ssr { dist, upstream } => {
            let render = any(proxy).with_state(Upstream::new(upstream));
            // Form posts to a page (React Router actions) must reach the renderer too.
            let files = files(dist).call_fallback_on_method_not_allowed(true);
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

/// Forwards method, path, headers, cookies and body, and streams the answer back.
async fn proxy(State(up): State<Upstream>, mut req: Request) -> Response {
    // CONNECT and `OPTIONS *` are not page requests; refusing them keeps the authority fixed.
    if req.method() == Method::CONNECT {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let path = req.uri().path_and_query().map_or("/", |p| p.as_str());
    if !path.starts_with('/') {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(uri) = format!("{}{path}", up.base).parse::<Uri>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    *req.uri_mut() = uri;
    strip_hop_by_hop(req.headers_mut());

    match tokio::time::timeout(RENDER_TIMEOUT, up.client.request(req)).await {
        Ok(Ok(res)) => {
            let mut res = res.map(Body::new);
            strip_hop_by_hop(res.headers_mut());
            res
        }
        Ok(Err(err)) => {
            tracing::error!(%err, upstream = %up.base, "page renderer unreachable");
            (StatusCode::BAD_GATEWAY, "The page renderer is not running.").into_response()
        }
        Err(_) => {
            tracing::warn!(upstream = %up.base, "page renderer did not answer in time");
            (
                StatusCode::GATEWAY_TIMEOUT,
                "The page took too long to render.",
            )
                .into_response()
        }
    }
}

/// Headers that describe one connection (RFC 9110 7.6.1) and must not be passed along.
fn strip_hop_by_hop(headers: &mut HeaderMap) {
    let named: Vec<String> = headers
        .get_all(header::CONNECTION)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(','))
        .map(|name| name.trim().to_ascii_lowercase())
        .filter(|name| !name.is_empty())
        .collect();
    for name in named {
        headers.remove(name.as_str());
    }
    for name in [
        header::CONNECTION,
        header::PROXY_AUTHORIZATION,
        header::PROXY_AUTHENTICATE,
        header::TE,
        header::TRAILER,
        header::TRANSFER_ENCODING,
        header::UPGRADE,
    ] {
        headers.remove(name);
    }
    headers.remove("keep-alive");
}
