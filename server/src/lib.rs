mod health;

use std::path::PathBuf;

use axum::http::StatusCode;
use axum::routing::any;
use axum::{Json, Router};
use serde_json::{Value, json};
use sqlx::PgPool;
use utoipa::openapi::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}

/// Every API route is registered here; the OpenAPI spec and the runtime router both come from it.
pub fn api_router() -> OpenApiRouter<AppState> {
    let api = OpenApiRouter::new().routes(routes!(health::health));
    OpenApiRouter::new().nest("/api", api)
}

pub fn openapi() -> OpenApi {
    api_router().split_for_parts().1
}

pub fn app(state: AppState, _web_dist: Option<PathBuf>) -> Router {
    let (router, _) = api_router().split_for_parts();
    router
        .route("/api", any(json_404))
        .route("/api/{*rest}", any(json_404))
        .with_state(state)
}

async fn json_404() -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "not found" })))
}
