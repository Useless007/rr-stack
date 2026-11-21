use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection, QueryRejection};
use axum::extract::{FromRequest, FromRequestParts};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use utoipa::ToSchema;

/// The body of every 4xx/5xx the API returns, so clients get a typed error instead of plain text.
#[derive(Serialize, ToSchema)]
pub struct ApiError {
    /// Stable machine-readable code: `bad_request`, `not_found`, `method_not_allowed`, `validation`, `internal`.
    pub error: String,
    /// Human-readable explanation, safe to show to a user.
    pub message: String,
}

pub enum AppError {
    BadRequest(String),
    NotFound(&'static str),
    MethodNotAllowed,
    Validation(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        Self::Db(err)
    }
}

impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        match rejection {
            JsonRejection::JsonDataError(err) => Self::Validation(err.body_text()),
            other => Self::BadRequest(other.body_text()),
        }
    }
}

impl From<PathRejection> for AppError {
    fn from(rejection: PathRejection) -> Self {
        Self::BadRequest(rejection.body_text())
    }
}

impl From<QueryRejection> for AppError {
    fn from(rejection: QueryRejection) -> Self {
        Self::BadRequest(rejection.body_text())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error, message) = match self {
            Self::BadRequest(m) => (StatusCode::BAD_REQUEST, "bad_request", m),
            Self::NotFound(what) => (
                StatusCode::NOT_FOUND,
                "not_found",
                format!("{what} not found"),
            ),
            Self::MethodNotAllowed => (
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
                "this path does not accept that method".to_owned(),
            ),
            Self::Validation(m) => (StatusCode::UNPROCESSABLE_ENTITY, "validation", m),
            Self::Db(err) => {
                tracing::error!(%err, "database error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "internal error".to_owned(),
                )
            }
        };
        (
            status,
            Json(ApiError {
                error: error.into(),
                message,
            }),
        )
            .into_response()
    }
}

/// `axum::Json`, but a bad body becomes an `ApiError` (422 for invalid fields, 400 for malformed JSON).
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub struct AppJson<T>(pub T);

impl<T: Serialize> IntoResponse for AppJson<T> {
    fn into_response(self) -> Response {
        Json(self.0).into_response()
    }
}

/// `axum::extract::Path` with an `ApiError` 400 on a malformed segment.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(AppError))]
pub struct AppPath<T>(pub T);

/// `axum::extract::Query` with an `ApiError` 400 on a malformed query string.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Query), rejection(AppError))]
pub struct AppQuery<T>(pub T);
