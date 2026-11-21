use std::path::PathBuf;

use server::{AppState, Pages, app};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // RUST_LOG overrides; by default sqlx's notices ("relation ... already exists") stay quiet.
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,sqlx=warn"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
    // `cargo run` from server/ picks up the repo-root .env; real env vars still win.
    dotenvy::from_filename("../.env").ok();
    // Neon (and Vercel's Postgres integrations) set DATABASE_URL to a connection pooler, which
    // drops LISTEN (realtime events) and the session lock migrations take. Use the direct one.
    let (database_var, database_url) = ["DATABASE_URL_UNPOOLED", "DATABASE_URL"]
        .into_iter()
        .find_map(|name| std::env::var(name).ok().map(|url| (name, url)))
        .ok_or("DATABASE_URL is not set")?;
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
    // An empty WEB_DIST serves the API only (`bun run dev`, where Vite serves the pages).
    let dist = std::env::var("WEB_DIST").unwrap_or_else(|_| "../web/build/client".into());
    let pages = match (dist.is_empty(), std::env::var("WEB_SSR_URL")) {
        (true, _) => None,
        // Set when the app was created with --ssr: pages come from the React Router server.
        (false, Ok(upstream)) if !upstream.is_empty() => {
            server::check_upstream(&upstream)?;
            Some(Pages::Ssr {
                dist: PathBuf::from(dist),
                upstream,
            })
        }
        (false, _) => Some(Pages::Spa(PathBuf::from(dist))),
    };

    // Each server process holds up to this many connections (plus one for realtime events). On a
    // host that starts many processes against a small database, lower it with DATABASE_POOL_MAX.
    let pool_max = std::env::var("DATABASE_POOL_MAX")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);
    tracing::info!("database from {database_var}, up to {pool_max} connections");
    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(pool_max)
        .connect(&database_url)
        .await?;
    sqlx::migrate!().run(&db).await?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    // ConnectInfo gives handlers the client address (sign-in rate limiting).
    let service =
        app(AppState::new(db), pages).into_make_service_with_connect_info::<std::net::SocketAddr>();
    axum::serve(listener, service).await?;
    Ok(())
}
