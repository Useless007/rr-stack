# One image for both processes: the Rust server (default command) and the page renderer
# (`bun /app/web/server.ts`). compose.yml runs one container of each.
FROM oven/bun:1 AS web
WORKDIR /src
COPY openapi.json ./
COPY web/package.json web/bun.lock web/
RUN cd web && bun install --frozen-lockfile
COPY web web
# The renderer needs only runtime dependencies next to the build.
RUN cd web && bun run build && rm -rf node_modules && bun install --frozen-lockfile --production

FROM rust:1-slim-bookworm AS server
WORKDIR /src/server
COPY server ./
# Queries are checked against the committed .sqlx/ metadata, so no database is needed to build.
ENV SQLX_OFFLINE=true
RUN cargo build --release --locked --bin server

FROM oven/bun:1-slim
COPY --from=server /src/server/target/release/server /app/server
COPY --from=web /src/web/build /app/web/build
COPY --from=web /src/web/node_modules /app/web/node_modules
COPY --from=web /src/web/package.json /src/web/server.ts /app/web/
ENV WEB_DIST=/app/web/build/client PORT=3000
EXPOSE 3000
USER bun
# Migrations are compiled into the binary and run on startup.
CMD ["/app/server"]
