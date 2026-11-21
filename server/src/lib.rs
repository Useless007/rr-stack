mod auth;
mod error;
mod events;
mod health;
mod limit;
mod pages;
mod todos;

pub use error::AppError;

use axum::Router;
use axum::routing::any;
use sqlx::PgPool;
use utoipa::openapi::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub events: tokio::sync::broadcast::Sender<events::TodoEvent>,
    /// Sign-in and sign-up attempts per client address: 10 per minute.
    pub sign_in_limit: std::sync::Arc<limit::RateLimiter>,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            events: events::channel(),
            sign_in_limit: std::sync::Arc::new(limit::RateLimiter::new(
                10,
                std::time::Duration::from_secs(60),
            )),
        }
    }
}

/// The contract's header, plus schemas that no HTTP route returns but clients still need typed
/// (WebSocket messages). `info` is spelled out: derived from Cargo it would change whenever the
/// package is renamed, which `create-rr-stack` does for every new project.
#[derive(utoipa::OpenApi)]
#[openapi(
    info(
        title = "API",
        version = "1.0.0",
        description = "HTTP API of this app. Generated from the Rust handlers."
    ),
    components(schemas(events::TodoEvent))
)]
struct ExtraSchemas;

/// Every API route is registered here; the OpenAPI spec and the runtime router both come from it.
pub fn api_router() -> OpenApiRouter<AppState> {
    let api = OpenApiRouter::new()
        .routes(routes!(health::health))
        .routes(routes!(todos::list_todos, todos::create_todo))
        .routes(routes!(
            todos::get_todo,
            todos::update_todo,
            todos::delete_todo
        ))
        .routes(routes!(todos::get_stats))
        .routes(routes!(auth::register))
        .routes(routes!(auth::login))
        .routes(routes!(auth::logout))
        .routes(routes!(auth::me));
    OpenApiRouter::with_openapi(<ExtraSchemas as utoipa::OpenApi>::openapi()).nest("/api", api)
}

pub fn openapi() -> OpenApi {
    api_router().split_for_parts().1
}

pub use pages::Pages;

/// `pages` says how non-API paths are answered; `None` serves the API only (tests).
pub fn app(state: AppState, pages: Option<Pages>) -> Router {
    let (router, _) = api_router().split_for_parts();
    let router = router
        .route("/api/events", axum::routing::get(events::events))
        .route("/api", any(json_404))
        .route("/api/", any(json_404))
        .route("/api/{*rest}", any(json_404))
        .method_not_allowed_fallback(|| async { AppError::MethodNotAllowed })
        .with_state(state);
    let router = match pages {
        Some(pages) => pages::serve(router, pages),
        None => router,
    };
    security_headers(router)
}

/// Headers every response gets: no MIME sniffing, no framing (clickjacking), no full-URL referrers.
fn security_headers(router: Router) -> Router {
    use axum::http::{HeaderName, HeaderValue};
    use tower_http::set_header::SetResponseHeaderLayer;
    let headers = [
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("referrer-policy", "strict-origin-when-cross-origin"),
    ];
    headers.into_iter().fold(router, |router, (name, value)| {
        router.layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static(name),
            HeaderValue::from_static(value),
        ))
    })
}

async fn json_404() -> AppError {
    AppError::NotFound("route")
}
