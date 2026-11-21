use axum::extract::State;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::error::{ApiError, AppError, AppJson, AppPath, AppQuery};
use crate::events::{self, TodoEvent};

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

/// Fields left out are not changed.
#[derive(Deserialize, ToSchema)]
pub struct TodoPatch {
    pub title: Option<TodoTitle>,
    pub done: Option<bool>,
}

#[derive(Clone, Serialize, ToSchema)]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub done: bool,
    /// The user who created it. `null` for todos made before sign-in existed; nobody can change those.
    pub owner_id: Option<i64>,
    #[schema(format = DateTime)]
    pub created_at: String,
}

#[derive(Clone, Copy, Default, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum StatusFilter {
    #[default]
    All,
    Open,
    Done,
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ListParams {
    /// Which todos to return. Defaults to all.
    pub status: Option<StatusFilter>,
    /// Case-insensitive text to find in the title.
    pub q: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct Stats {
    pub total: i64,
    pub open: i64,
    pub done: i64,
}

struct TodoRow {
    id: i64,
    title: String,
    done: bool,
    owner_id: Option<i64>,
    created_at: DateTime<Utc>,
}

impl From<TodoRow> for Todo {
    fn from(row: TodoRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            done: row.done,
            owner_id: row.owner_id,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[utoipa::path(
    get,
    path = "/todos",
    operation_id = "listTodos",
    params(ListParams),
    responses((status = OK, body = Vec<Todo>), (status = BAD_REQUEST, body = ApiError))
)]
pub async fn list_todos(
    State(state): State<AppState>,
    AppQuery(params): AppQuery<ListParams>,
) -> Result<AppJson<Vec<Todo>>, AppError> {
    let status = match params.status.unwrap_or_default() {
        StatusFilter::All => None,
        StatusFilter::Open => Some(false),
        StatusFilter::Done => Some(true),
    };
    let q = params
        .q
        .map(|q| q.trim().to_lowercase())
        .filter(|q| !q.is_empty());
    // strpos instead of LIKE, so % and _ in the search text are matched literally.
    let rows = sqlx::query_as!(
        TodoRow,
        r#"SELECT id, title, done, owner_id, created_at FROM todos
           WHERE ($1::bool IS NULL OR done = $1)
             AND ($2::text IS NULL OR strpos(lower(title), lower($2)) > 0)
           ORDER BY created_at DESC, id DESC"#,
        status,
        q
    )
    .fetch_all(&state.db)
    .await?;
    Ok(AppJson(rows.into_iter().map(Todo::from).collect()))
}

#[utoipa::path(
    get,
    path = "/todos/{id}",
    operation_id = "getTodo",
    params(("id" = i64, Path)),
    responses((status = OK, body = Todo), (status = NOT_FOUND, body = ApiError), (status = BAD_REQUEST, body = ApiError))
)]
pub async fn get_todo(
    State(state): State<AppState>,
    AppPath(id): AppPath<i64>,
) -> Result<AppJson<Todo>, AppError> {
    let row = sqlx::query_as!(
        TodoRow,
        "SELECT id, title, done, owner_id, created_at FROM todos WHERE id = $1",
        id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound("todo"))?;
    Ok(AppJson(row.into()))
}

#[utoipa::path(
    post,
    path = "/todos",
    operation_id = "createTodo",
    request_body = NewTodo,
    responses(
        (status = CREATED, body = Todo),
        (status = UNAUTHORIZED, body = ApiError),
        (status = UNPROCESSABLE_ENTITY, body = ApiError),
    )
)]
pub async fn create_todo(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(new): AppJson<NewTodo>,
) -> Result<(StatusCode, AppJson<Todo>), AppError> {
    let row = sqlx::query_as!(
        TodoRow,
        "INSERT INTO todos (title, owner_id) VALUES ($1, $2) RETURNING id, title, done, owner_id, created_at",
        new.title.0,
        user.id
    )
    .fetch_one(&state.db)
    .await?;
    let todo = Todo::from(row);
    events::publish(&state.db, &TodoEvent::Created { todo: todo.clone() }).await;
    Ok((StatusCode::CREATED, AppJson(todo)))
}

#[utoipa::path(
    patch,
    path = "/todos/{id}",
    operation_id = "updateTodo",
    params(("id" = i64, Path)),
    request_body = TodoPatch,
    responses(
        (status = OK, body = Todo),
        (status = UNAUTHORIZED, body = ApiError),
        (status = FORBIDDEN, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
        (status = UNPROCESSABLE_ENTITY, body = ApiError),
    )
)]
pub async fn update_todo(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<i64>,
    AppJson(patch): AppJson<TodoPatch>,
) -> Result<AppJson<Todo>, AppError> {
    let row = sqlx::query_as!(
        TodoRow,
        r#"UPDATE todos SET title = COALESCE($2, title), done = COALESCE($3, done)
           WHERE id = $1 AND owner_id = $4 RETURNING id, title, done, owner_id, created_at"#,
        id,
        patch.title.map(|t| t.0),
        patch.done,
        user.id
    )
    .fetch_optional(&state.db)
    .await?;
    let Some(row) = row else {
        return Err(not_owned_or_missing(&state, id).await);
    };
    let todo = Todo::from(row);
    events::publish(&state.db, &TodoEvent::Updated { todo: todo.clone() }).await;
    Ok(AppJson(todo))
}

#[utoipa::path(
    delete,
    path = "/todos/{id}",
    operation_id = "deleteTodo",
    params(("id" = i64, Path)),
    responses(
        (status = NO_CONTENT),
        (status = UNAUTHORIZED, body = ApiError),
        (status = FORBIDDEN, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
    )
)]
pub async fn delete_todo(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<i64>,
) -> Result<StatusCode, AppError> {
    let deleted = sqlx::query!(
        "DELETE FROM todos WHERE id = $1 AND owner_id = $2",
        id,
        user.id
    )
    .execute(&state.db)
    .await?
    .rows_affected();
    if deleted == 0 {
        return Err(not_owned_or_missing(&state, id).await);
    }
    events::publish(&state.db, &TodoEvent::Deleted { id }).await;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(get, path = "/stats", operation_id = "getStats", responses((status = OK, body = Stats)))]
pub async fn get_stats(State(state): State<AppState>) -> Result<AppJson<Stats>, AppError> {
    let stats = sqlx::query_as!(
        Stats,
        r#"SELECT count(*) AS "total!",
                  count(*) FILTER (WHERE NOT done) AS "open!",
                  count(*) FILTER (WHERE done) AS "done!"
           FROM todos"#
    )
    .fetch_one(&state.db)
    .await?;
    Ok(AppJson(stats))
}

/// A write matched no row: tell "not yours" (403) apart from "does not exist" (404).
async fn not_owned_or_missing(state: &AppState, id: i64) -> AppError {
    match sqlx::query_scalar!("SELECT EXISTS (SELECT 1 FROM todos WHERE id = $1)", id)
        .fetch_one(&state.db)
        .await
    {
        Ok(Some(true)) => AppError::Forbidden,
        Ok(_) => AppError::NotFound("todo"),
        Err(err) => err.into(),
    }
}
