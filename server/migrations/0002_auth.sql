CREATE TABLE users (
    id bigserial PRIMARY KEY,
    email text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Only a SHA-256 of the session token is stored, so a database leak does not leak sessions.
CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Existing todos keep a NULL owner: anyone can read them, nobody can change them.
ALTER TABLE todos ADD COLUMN owner_id bigint REFERENCES users(id) ON DELETE SET NULL;
