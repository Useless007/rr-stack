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
    let database_url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is not set")?;
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

    let db = sqlx::PgPool::connect(&database_url).await?;
    sqlx::migrate!().run(&db).await?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    // ConnectInfo gives handlers the client address (sign-in rate limiting).
    let service =
        app(AppState::new(db), pages).into_make_service_with_connect_info::<std::net::SocketAddr>();
    axum::serve(listener, service).await?;
    Ok(())
}
