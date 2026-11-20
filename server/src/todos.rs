use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{AppError, AppState};

/// A title that is already trimmed and 1..=200 characters; it cannot be built any other way.
#[derive(Deserialize, ToSchema)]
#[serde(try_from = "String")]
#[schema(value_type = String, min_length = 1, max_length = 200)]
pub struct TodoTitle(String);

impl TryFrom<String> for TodoTitle {
    type Error = &'static str;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        let title = raw.trim();
        match title.chars().count() {
            0 => Err("title must not be empty"),
            1..=200 => Ok(Self(title.to_owned())),
            _ => Err("title must be at most 200 characters"),
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct NewTodo {
    pub title: TodoTitle,
}

#[derive(Serialize, ToSchema)]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub done: bool,
    /// RFC 3339 timestamp.
    pub created_at: String,
}

struct TodoRow {
    id: i64,
    title: String,
    done: bool,
    created_at: DateTime<Utc>,
}

impl From<TodoRow> for Todo {
    fn from(row: TodoRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            done: row.done,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[utoipa::path(get, path = "/todos", operation_id = "listTodos", responses((status = OK, body = Vec<Todo>)))]
pub async fn list_todos(State(state): State<AppState>) -> Result<Json<Vec<Todo>>, AppError> {
    let rows = sqlx::query_as!(
        TodoRow,
        "SELECT id, title, done, created_at FROM todos ORDER BY created_at DESC, id DESC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows.into_iter().map(Todo::from).collect()))
}

#[utoipa::path(
    post,
    path = "/todos",
    operation_id = "createTodo",
    request_body = NewTodo,
    responses(
        (status = CREATED, body = Todo),
        (status = UNPROCESSABLE_ENTITY, description = "title is empty or longer than 200 characters"),
    )
)]
pub async fn create_todo(
    State(state): State<AppState>,
    Json(new): Json<NewTodo>,
) -> Result<(StatusCode, Json<Todo>), AppError> {
    let row = sqlx::query_as!(
        TodoRow,
        "INSERT INTO todos (title) VALUES ($1) RETURNING id, title, done, created_at",
        new.title.0
    )
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(row.into())))
}
