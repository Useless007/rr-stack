# The whole app in one image: React pages built by bun, the Rust server built in release mode.
FROM oven/bun:1.4.5 AS web
WORKDIR /src
COPY openapi.json ./
COPY web/package.json web/bun.lock web/
RUN cd web && bun install --frozen-lockfile
COPY web web
# The public address, baked into canonical links, share cards and sitemap.xml (see .env.example).
ARG SITE_URL
RUN cd web && bun run build

FROM rust:1-slim-bookworm AS server
WORKDIR /src/server
COPY server ./
# Queries are checked against the committed .sqlx/ metadata, so no database is needed to build.
ENV SQLX_OFFLINE=true
RUN cargo build --release --locked --bin server

# Same Debian release as the build stage, so the binary's glibc matches.
FROM debian:bookworm-slim
RUN useradd --system --no-create-home app
COPY --from=server /src/server/target/release/server /app/server
COPY --from=web /src/web/build/client /app/web
ENV WEB_DIST=/app/web PORT=3000
EXPOSE 3000
USER app
# Migrations are compiled into the binary and run on startup.
CMD ["/app/server"]
