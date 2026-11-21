-- Sign-in attempts per client address (src/limit.rs). In the database so that every server process
-- counts together. UNLOGGED: faster, and a database crash only resets the counters.
CREATE UNLOGGED TABLE rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    hits integer NOT NULL
);
CREATE INDEX rate_limits_window_start_idx ON rate_limits (window_start);
