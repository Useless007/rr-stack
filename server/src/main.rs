use std::path::PathBuf;

use server::{AppState, app};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    // `cargo run` from server/ picks up the repo-root .env; real env vars still win.
    dotenvy::from_filename("../.env").ok();
    let database_url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is not set")?;
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
    let web_dist =
        PathBuf::from(std::env::var("WEB_DIST").unwrap_or_else(|_| "../web/build/client".into()));

    let db = sqlx::PgPool::connect(&database_url).await?;
    sqlx::migrate!().run(&db).await?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    axum::serve(listener, app(AppState::new(db), Some(web_dist))).await?;
    Ok(())
}
