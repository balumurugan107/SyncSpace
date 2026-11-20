-- Phase 1: identity and sessions.

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT        NOT NULL,
    password_hash  TEXT        NOT NULL,
    display_name   TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ,
    CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
    CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 80)
);

-- Emails are stored lower-cased by the application; the unique index enforces one account per email.
CREATE UNIQUE INDEX users_email_unique ON users (email);

-- One row per issued refresh token. Only a SHA-256 hash of the token is stored,
-- so a database leak does not leak usable session tokens.
--
-- family_id groups every token produced by rotating a single login. If a token
-- that was already rotated is presented again (a sign of theft), the whole
-- family is revoked and that login is forced to sign in again.
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id       UUID        NOT NULL,
    token_hash      TEXT        NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT CHECK (revoked_reason IN ('rotated', 'logout', 'logout_all', 'reuse_detected')),
    replaced_by     UUID REFERENCES refresh_tokens (id) ON DELETE SET NULL,
    user_agent      TEXT,
    ip_address      TEXT
);

CREATE INDEX refresh_tokens_user_active_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
