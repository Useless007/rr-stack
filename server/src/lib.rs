mod auth;
mod error;
mod events;
mod health;
mod todos;

pub use error::AppError;

use std::path::PathBuf;

use axum::Router;
use axum::routing::any;
use sqlx::PgPool;
use tower_http::services::{ServeDir, ServeFile};
use utoipa::openapi::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub events: tokio::sync::broadcast::Sender<events::TodoEvent>,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            events: events::channel(),
        }
    }
}

/// Schemas that no HTTP route returns but clients still need typed (WebSocket messages).
#[derive(utoipa::OpenApi)]
#[openapi(components(schemas(events::TodoEvent)))]
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

/// `web_dist` is the React Router `build/client` dir; `None` serves the API only (tests).
pub fn app(state: AppState, web_dist: Option<PathBuf>) -> Router {
    let (router, _) = api_router().split_for_parts();
    let router = router
        .route("/api/events", axum::routing::get(events::events))
        .route("/api", any(json_404))
        .route("/api/", any(json_404))
        .route("/api/{*rest}", any(json_404))
        .method_not_allowed_fallback(|| async { AppError::MethodNotAllowed })
        .with_state(state);
    let router = match web_dist {
        // Prerendered pages are real files; any other path gets the SPA shell so deep links work.
        Some(dir) => {
            let spa = ServeFile::new(dir.join("__spa-fallback.html"));
            router.fallback_service(ServeDir::new(dir).fallback(spa))
        }
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
