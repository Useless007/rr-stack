use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;
use sqlx::PgPool;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use crate::AppError;

/// Fixed-window counter per client address, kept in Postgres (`rate_limits`) so that every server
/// process counts together: several replicas, or the instances a platform such as Vercel starts.
///
/// Per-address limits slow down guessing from one machine; they cannot stop an attacker with many
/// addresses. Rows of expired windows are deleted as new windows start, so the table stays small.
#[derive(Clone)]
pub struct RateLimit {
    pub limit: i32,
    pub window: Duration,
}

impl RateLimit {
    /// Counts one attempt from `ip`; `TooManyRequests` once it is over the limit for this window.
    pub async fn check(&self, db: &PgPool, ip: IpAddr) -> Result<(), AppError> {
        let secs = self.window.as_secs_f64();
        let row = sqlx::query!(
            r#"INSERT INTO rate_limits AS r (key, window_start, hits) VALUES ($1, now(), 1)
               ON CONFLICT (key) DO UPDATE SET
                 window_start = CASE WHEN r.window_start <= now() - make_interval(secs => $2)
                                THEN now() ELSE r.window_start END,
                 hits = CASE WHEN r.window_start <= now() - make_interval(secs => $2)
                        THEN 1 ELSE r.hits + 1 END
               RETURNING hits,
                 ceil(extract(epoch FROM r.window_start + make_interval(secs => $2) - now()))::bigint
                   AS "retry_after!""#,
            bucket(ip).to_string(),
            secs
        )
        .fetch_one(db)
        .await?;
        // Housekeeping: a failure here must not turn a counted attempt into an error.
        if row.hits == 1
            && let Err(err) = sqlx::query!(
                "DELETE FROM rate_limits WHERE window_start <= now() - make_interval(secs => $1)",
                secs
            )
            .execute(db)
            .await
        {
            tracing::warn!("could not delete expired rate limit windows: {err}");
        }
        if row.hits > self.limit {
            let retry_after_secs = u64::try_from(row.retry_after).unwrap_or(1).max(1);
            return Err(AppError::TooManyRequests { retry_after_secs });
        }
        Ok(())
    }
}

/// IPv6 users get a whole /64 from their provider, so one person can rotate through 2^64
/// addresses. Count the /64 as one client; IPv4 stays per address.
fn bucket(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V4(_) => ip,
        IpAddr::V6(v6) if v6.to_ipv4_mapped().is_some() => {
            v6.to_ipv4_mapped().map_or(ip, IpAddr::V4)
        }
        IpAddr::V6(v6) => {
            let mut seg = v6.segments();
            seg[4..].fill(0);
            IpAddr::V6(seg.into())
        }
    }
}

/// The last X-Forwarded-For entry across every such header: the one our own proxy appended.
/// Earlier entries, and extra headers, come from the client and can be anything.
fn forwarded_client(headers: &axum::http::HeaderMap) -> Option<IpAddr> {
    let all: Vec<&str> = headers
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .collect();
    all.join(",").rsplit(',').next()?.trim().parse().ok()
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
            .then(|| forwarded_client(&parts.headers))
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
        let one = |v: &str| {
            let mut h = axum::http::HeaderMap::new();
            h.insert("x-forwarded-for", v.parse().unwrap());
            forwarded_client(&h)
        };
        // A client can send any X-Forwarded-For; the trusted proxy appends the real address last.
        assert_eq!(
            one("1.1.1.1, 203.0.113.7"),
            Some("203.0.113.7".parse().unwrap())
        );
        assert_eq!(one("203.0.113.7"), Some("203.0.113.7".parse().unwrap()));
        assert_eq!(one("garbage"), None);
    }

    #[test]
    fn ipv4_mapped_ipv6_counts_as_the_ipv4_address() {
        let mapped: IpAddr = "::ffff:203.0.113.7".parse().unwrap();
        assert_eq!(bucket(mapped), "203.0.113.7".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn forwarded_for_across_several_headers_uses_the_last_entry_overall() {
        let mut headers = axum::http::HeaderMap::new();
        headers.append("x-forwarded-for", "203.0.113.7".parse().unwrap());
        headers.append("x-forwarded-for", "1.1.1.1, 198.51.100.9".parse().unwrap());
        assert_eq!(
            forwarded_client(&headers),
            Some("198.51.100.9".parse().unwrap())
        );
    }
}
