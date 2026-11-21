mod error;
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
}

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
        .routes(routes!(todos::get_stats));
    OpenApiRouter::new().nest("/api", api)
}

pub fn openapi() -> OpenApi {
    api_router().split_for_parts().1
}

/// `web_dist` is the React Router `build/client` dir; `None` serves the API only (tests).
pub fn app(state: AppState, web_dist: Option<PathBuf>) -> Router {
    let (router, _) = api_router().split_for_parts();
    let router = router
        .route("/api", any(json_404))
        .route("/api/", any(json_404))
        .route("/api/{*rest}", any(json_404))
        .method_not_allowed_fallback(|| async { AppError::MethodNotAllowed })
        .with_state(state);
    match web_dist {
        // Prerendered pages are real files; any other path gets the SPA shell so deep links work.
        Some(dir) => {
            let spa = ServeFile::new(dir.join("__spa-fallback.html"));
            router.fallback_service(ServeDir::new(dir).fallback(spa))
        }
        None => router,
    }
}

async fn json_404() -> AppError {
    AppError::NotFound("route")
}
