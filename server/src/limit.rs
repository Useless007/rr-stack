use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Fixed-window counter per client address. In memory: one server process, resets on restart.
/// shortcut: per-process only; with several replicas, move the counter to Postgres or Redis.
pub struct RateLimiter {
    state: Mutex<Buckets>,
    limit: u32,
    window: Duration,
    capacity: usize,
}

struct Buckets {
    hits: HashMap<IpAddr, (Instant, u32)>,
    last_prune: Instant,
}

impl RateLimiter {
    pub fn new(limit: u32, window: Duration) -> Self {
        Self::with_capacity(limit, window, 100_000)
    }

    /// `capacity` bounds memory: once that many addresses are tracked, new ones are refused
    /// until old windows expire (failing closed is the safe side for sign-in).
    pub fn with_capacity(limit: u32, window: Duration, capacity: usize) -> Self {
        let state = Buckets {
            hits: HashMap::new(),
            last_prune: Instant::now(),
        };
        Self {
            state: Mutex::new(state),
            limit,
            window,
            capacity,
        }
    }

    /// `Ok(())` to proceed, or `Err(seconds)` until this address may try again.
    pub fn check(&self, ip: IpAddr) -> Result<(), u64> {
        let key = bucket(ip);
        let now = Instant::now();
        let window = self.window;
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        // Prune at most once per window, so a flood cannot make every request scan the map.
        if now.duration_since(state.last_prune) >= window {
            state
                .hits
                .retain(|_, (start, _)| now.duration_since(*start) < window);
            state.last_prune = now;
        }
        if !state.hits.contains_key(&key) && state.hits.len() >= self.capacity {
            return Err(window.as_secs().max(1));
        }
        let entry = state.hits.entry(key).or_insert((now, 0));
        if now.duration_since(entry.0) >= window {
            *entry = (now, 0);
        }
        entry.1 += 1;
        if entry.1 > self.limit {
            Err(window
                .saturating_sub(now.duration_since(entry.0))
                .as_secs()
                .max(1))
        } else {
            Ok(())
        }
    }
}

/// IPv6 users get a whole /64 from their provider, so one person can rotate through 2^64
/// addresses. Count the /64 as one client; IPv4 stays per address.
fn bucket(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V4(_) => ip,
        IpAddr::V6(v6) => {
            let mut seg = v6.segments();
            seg[4..].fill(0);
            IpAddr::V6(seg.into())
        }
    }
}

/// The last X-Forwarded-For entry: the one our own proxy appended. Earlier entries come from the
/// client and can be anything.
fn last_forwarded(header: &str) -> Option<IpAddr> {
    header.rsplit(',').next()?.trim().parse().ok()
}

/// The address a request came from. Behind exactly one reverse proxy that appends to
/// `X-Forwarded-For` (Caddy, nginx, most load balancers), set `TRUST_PROXY=true`. Never set it
/// when clients can reach the server directly, or they can pick any address they like.
pub struct ClientIp(pub IpAddr);

impl<S: Send + Sync> FromRequestParts<S> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let trust_proxy = std::env::var("TRUST_PROXY").is_ok_and(|v| v == "true" || v == "1");
        let forwarded = trust_proxy
            .then(|| last_forwarded(parts.headers.get("x-forwarded-for")?.to_str().ok()?))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipv6_addresses_in_one_slash_64_share_a_bucket() {
        let a: IpAddr = "2001:db8:1:2:aaaa::1".parse().unwrap();
        let b: IpAddr = "2001:db8:1:2:bbbb::9".parse().unwrap();
        let other: IpAddr = "2001:db8:1:3::1".parse().unwrap();
        assert_eq!(bucket(a), bucket(b));
        assert_ne!(bucket(a), bucket(other));
        let v4: IpAddr = "203.0.113.7".parse().unwrap();
        assert_eq!(bucket(v4), v4);
    }

    #[test]
    fn forwarded_for_uses_the_entry_our_proxy_appended() {
        // A client can send any X-Forwarded-For; the trusted proxy appends the real address last.
        assert_eq!(
            last_forwarded("1.1.1.1, 203.0.113.7"),
            Some("203.0.113.7".parse().unwrap())
        );
        assert_eq!(
            last_forwarded("203.0.113.7"),
            Some("203.0.113.7".parse().unwrap())
        );
        assert_eq!(last_forwarded("garbage"), None);
    }

    #[test]
    fn a_flood_of_new_addresses_is_capped() {
        let limiter = RateLimiter::with_capacity(10, Duration::from_secs(60), 3);
        for i in 0..3u8 {
            assert!(limiter.check(IpAddr::from([10, 0, 0, i])).is_ok());
        }
        assert!(
            limiter.check(IpAddr::from([10, 0, 0, 99])).is_err(),
            "no room for a 4th address"
        );
        assert!(
            limiter.check(IpAddr::from([10, 0, 0, 1])).is_ok(),
            "known addresses still work"
        );
    }
}
