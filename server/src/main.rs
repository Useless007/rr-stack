use std::path::PathBuf;

use server::{AppState, Pages, app};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    // `cargo run` from server/ picks up the repo-root .env; real env vars still win.
    dotenvy::from_filename("../.env").ok();
    let database_url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is not set")?;
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
    let dist =
        PathBuf::from(std::env::var("WEB_DIST").unwrap_or_else(|_| "../web/build/client".into()));
    // Set when the app was created with --ssr: pages come from the React Router server.
    let pages = match std::env::var("WEB_SSR_URL") {
        Ok(upstream) if !upstream.is_empty() => {
            server::check_upstream(&upstream)?;
            Pages::Ssr { dist, upstream }
        }
        _ => Pages::Spa(dist),
    };

    let db = sqlx::PgPool::connect(&database_url).await?;
    sqlx::migrate!().run(&db).await?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    // ConnectInfo gives handlers the client address (sign-in rate limiting).
    let service = app(AppState::new(db), Some(pages))
        .into_make_service_with_connect_info::<std::net::SocketAddr>();
    axum::serve(listener, service).await?;
    Ok(())
}
