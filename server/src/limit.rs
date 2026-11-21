use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Fixed-window counter per client address. In memory: one server process, resets on restart.
/// shortcut: per-process only; with several replicas, move the counter to Postgres or Redis.
pub struct RateLimiter {
    hits: Mutex<HashMap<IpAddr, (Instant, u32)>>,
    limit: u32,
    window: Duration,
}

impl RateLimiter {
    pub fn new(limit: u32, window: Duration) -> Self {
        Self {
            hits: Mutex::new(HashMap::new()),
            limit,
            window,
        }
    }

    /// `Ok(())` to proceed, or `Err(seconds)` until this address may try again.
    pub fn check(&self, ip: IpAddr) -> Result<(), u64> {
        let now = Instant::now();
        let mut hits = self
            .hits
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if hits.len() > 10_000 {
            hits.retain(|_, (start, _)| now.duration_since(*start) < self.window);
        }
        let entry = hits.entry(ip).or_insert((now, 0));
        if now.duration_since(entry.0) >= self.window {
            *entry = (now, 0);
        }
        entry.1 += 1;
        if entry.1 > self.limit {
            Err(self
                .window
                .saturating_sub(now.duration_since(entry.0))
                .as_secs()
                .max(1))
        } else {
            Ok(())
        }
    }
}

/// The address a request came from. Behind a reverse proxy set `TRUST_PROXY=true` so the first
/// `X-Forwarded-For` entry is used; never set it when clients can reach the server directly, or
/// they can pick any address they like.
pub struct ClientIp(pub IpAddr);

impl<S: Send + Sync> FromRequestParts<S> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let trust_proxy = std::env::var("TRUST_PROXY").is_ok_and(|v| v == "true" || v == "1");
        let forwarded = trust_proxy
            .then(|| {
                parts
                    .headers
                    .get("x-forwarded-for")?
                    .to_str()
                    .ok()?
                    .split(',')
                    .next()?
                    .trim()
                    .parse()
                    .ok()
            })
            .flatten();
        let direct = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip());
        Ok(Self(
            forwarded
                .or(direct)
                .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED)),
        ))
    }
}
