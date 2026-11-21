use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use axum::extract::{FromRef, FromRequestParts, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::LazyLock;
use utoipa::ToSchema;

use crate::AppState;
use crate::error::{ApiError, AppError, AppJson};

const COOKIE: &str = "rr_session";
const SESSION_DAYS: i64 = 30;

/// An email address that is trimmed, lowercased and shaped like `local@domain.tld`.
#[derive(Deserialize, ToSchema)]
#[serde(try_from = "String")]
#[schema(value_type = String, format = Email)]
pub struct Email(String);

impl TryFrom<String> for Email {
    type Error = &'static str;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        let email = raw.trim().to_lowercase();
        let valid = email.len() <= 254
            && !email.chars().any(char::is_whitespace)
            && email.split_once('@').is_some_and(|(local, domain)| {
                !local.is_empty()
                    && domain.contains('.')
                    && !domain.starts_with('.')
                    && !domain.ends_with('.')
            });
        if valid {
            Ok(Self(email))
        } else {
            Err("email must look like name@example.com")
        }
    }
}

/// 8 to 128 characters. Never serialised, never logged.
#[derive(Deserialize, ToSchema)]
#[serde(try_from = "String")]
#[schema(value_type = String, format = Password, min_length = 8, max_length = 128)]
pub struct Password(String);

impl TryFrom<String> for Password {
    type Error = &'static str;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        match raw.chars().count() {
            0..8 => Err("password must be at least 8 characters"),
            8..=128 => Ok(Self(raw)),
            _ => Err("password must be at most 128 characters"),
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct Credentials {
    pub email: Email,
    pub password: Password,
}

#[derive(Serialize, ToSchema)]
pub struct User {
    pub id: i64,
    pub email: String,
}

/// The signed-in user. Use it as a handler argument to require a session (401 otherwise).
pub struct CurrentUser(pub User);

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = AppState::from_ref(state);
        let jar = CookieJar::from_headers(&parts.headers);
        let token = jar
            .get(COOKIE)
            .ok_or(AppError::Unauthorized)?
            .value()
            .to_owned();
        let user = sqlx::query_as!(
            User,
            r#"SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = $1 AND s.expires_at > now()"#,
            token_hash(&token)
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;
        Ok(Self(user))
    }
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn session_cookie(token: String) -> Cookie<'static> {
    Cookie::build((COOKIE, token))
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .secure(secure_cookies())
        .max_age(time::Duration::days(SESSION_DAYS))
        .build()
}

/// Secure unless `COOKIE_SECURE=false`. Browsers accept Secure cookies on http://localhost, so only
/// plain-HTTP setups on another host (Docker on a LAN IP, for example) need to turn it off.
fn secure_cookies() -> bool {
    !std::env::var("COOKIE_SECURE").is_ok_and(|v| v == "false" || v == "0")
}

async fn start_session(state: &AppState, user_id: i64) -> Result<Cookie<'static>, AppError> {
    // Cheap housekeeping so the table does not grow forever; no background job needed.
    sqlx::query!("DELETE FROM sessions WHERE expires_at < now()")
        .execute(&state.db)
        .await?;
    let token = hex::encode(rand::random::<[u8; 32]>());
    sqlx::query!(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))",
        token_hash(&token),
        user_id,
        SESSION_DAYS as i32
    )
    .execute(&state.db)
    .await?;
    Ok(session_cookie(token))
}

// Each Argon2id run takes ~19 MiB and real CPU. Capping how many run at once keeps a burst of
// sign-in requests from exhausting memory; extra requests wait instead.
static HASHING: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

/// Argon2id is deliberately slow, so it runs off the async workers.
async fn hash_password(password: Password) -> Result<String, AppError> {
    let _permit = HASHING
        .acquire()
        .await
        .map_err(|_| AppError::Internal("hash queue closed"))?;
    tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.0.as_bytes())
            .map(|h| h.to_string())
    })
    .await
    .map_err(|_| AppError::Internal("hashing task failed"))?
    .map_err(|_| AppError::Internal("could not hash password"))
}

// Verified against when the email is unknown, so a wrong email takes as long as a wrong password.
static DUMMY_HASH: LazyLock<String> = LazyLock::new(|| {
    Argon2::default()
        .hash_password(b"rr-stack timing equaliser")
        .map(|h| h.to_string())
        .unwrap_or_default()
});

async fn verify_password(password: Password, hash: String) -> bool {
    let Ok(_permit) = HASHING.acquire().await else {
        return false;
    };
    tokio::task::spawn_blocking(move || {
        PasswordHash::new(&hash).is_ok_and(|parsed| {
            Argon2::default()
                .verify_password(password.0.as_bytes(), &parsed)
                .is_ok()
        })
    })
    .await
    .unwrap_or(false)
}

#[utoipa::path(
    post,
    path = "/auth/register",
    operation_id = "register",
    request_body = Credentials,
    responses(
        (status = CREATED, body = User, description = "Signed in: sets the rr_session cookie"),
        (status = CONFLICT, body = ApiError),
        (status = UNPROCESSABLE_ENTITY, body = ApiError),
    )
)]
pub async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    AppJson(creds): AppJson<Credentials>,
) -> Result<(StatusCode, CookieJar, AppJson<User>), AppError> {
    let hash = hash_password(creds.password).await?;
    let user = sqlx::query_as!(
        User,
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email",
        creds.email.0,
        hash
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Conflict("an account with this email already exists"))?;
    let cookie = start_session(&state, user.id).await?;
    Ok((StatusCode::CREATED, jar.add(cookie), AppJson(user)))
}

#[utoipa::path(
    post,
    path = "/auth/login",
    operation_id = "login",
    request_body = Credentials,
    responses(
        (status = OK, body = User, description = "Signed in: sets the rr_session cookie"),
        (status = UNAUTHORIZED, body = ApiError),
        (status = UNPROCESSABLE_ENTITY, body = ApiError),
    )
)]
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    AppJson(creds): AppJson<Credentials>,
) -> Result<(CookieJar, AppJson<User>), AppError> {
    let found = sqlx::query!(
        "SELECT id, email, password_hash FROM users WHERE email = $1",
        creds.email.0
    )
    .fetch_optional(&state.db)
    .await?;
    let hash = found
        .as_ref()
        .map_or_else(|| DUMMY_HASH.clone(), |u| u.password_hash.clone());
    let ok = verify_password(creds.password, hash).await;
    let Some(row) = found.filter(|_| ok) else {
        return Err(AppError::BadCredentials);
    };
    let cookie = start_session(&state, row.id).await?;
    Ok((
        jar.add(cookie),
        AppJson(User {
            id: row.id,
            email: row.email,
        }),
    ))
}

#[utoipa::path(
    post,
    path = "/auth/logout",
    operation_id = "logout",
    responses(
        (status = NO_CONTENT, description = "Session ended and cookie cleared"),
        (status = FORBIDDEN, body = ApiError, description = "Sent from another site"),
    )
)]
pub async fn logout(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    jar: CookieJar,
) -> Result<(StatusCode, CookieJar), AppError> {
    // Logout has no body, so a form on another (sub)domain could post it. Browsers say where a
    // request came from in Sec-Fetch-Site; only this site may end the session.
    if headers
        .get("sec-fetch-site")
        .is_some_and(|v| v != "same-origin" && v != "none")
    {
        return Err(AppError::Forbidden);
    }
    if let Some(c) = jar.get(COOKIE) {
        sqlx::query!(
            "DELETE FROM sessions WHERE token_hash = $1",
            token_hash(c.value())
        )
        .execute(&state.db)
        .await?;
    }
    let mut gone = session_cookie(String::new());
    gone.set_max_age(time::Duration::ZERO);
    Ok((StatusCode::NO_CONTENT, jar.add(gone)))
}

#[utoipa::path(
    get,
    path = "/auth/me",
    operation_id = "me",
    responses((status = OK, body = User), (status = UNAUTHORIZED, body = ApiError))
)]
pub async fn me(CurrentUser(user): CurrentUser) -> AppJson<User> {
    AppJson(user)
}
