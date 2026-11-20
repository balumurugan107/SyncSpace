-- Phase 2: workspaces, membership, projects, tasks and activity history.

CREATE TABLE workspaces (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    description  TEXT        NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
    created_by   UUID        REFERENCES users (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership is the basis of every authorisation decision: a user can see a
-- workspace (and everything inside it) only if a row exists here.
CREATE TABLE workspace_members (
    workspace_id  UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role          TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members (user_id);
-- Exactly one owner per workspace, enforced by the database.
CREATE UNIQUE INDEX workspace_members_single_owner ON workspace_members (workspace_id) WHERE role = 'owner';

CREATE TABLE projects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    -- Short prefix for human-friendly task ids: WEB-1, WEB-2, ...
    key           TEXT        NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9]{1,5}$'),
    description   TEXT        NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    -- Last task number handed out. Incremented with UPDATE ... RETURNING, which
    -- row-locks the project, so two concurrent creates can never get the same number.
    task_counter  INTEGER     NOT NULL DEFAULT 0,
    created_by    UUID        REFERENCES users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, key)
);
CREATE INDEX projects_workspace_idx ON projects (workspace_id);

CREATE TABLE tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    -- Denormalised from the project so authorisation and "my tasks" need no join.
    workspace_id  UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    number        INTEGER     NOT NULL,
    title         TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description   TEXT        NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
    status        TEXT        NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED')),
    priority      TEXT        NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    assignee_id   UUID        REFERENCES users (id) ON DELETE SET NULL,
    reporter_id   UUID        REFERENCES users (id) ON DELETE SET NULL,
    due_date      DATE,
    -- Order within a Kanban column. Fractional: a card dropped between positions
    -- 1024 and 2048 gets 1536, so a move updates one row instead of the whole column.
    position      DOUBLE PRECISION NOT NULL,
    -- Optimistic concurrency: every update increments it; a client editing a stale
    -- copy is rejected with 409 instead of silently overwriting someone else's change.
    version       INTEGER     NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    UNIQUE (project_id, number)
);
CREATE INDEX tasks_board_idx ON tasks (project_id, status, position);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id, status) WHERE assignee_id IS NOT NULL;

-- Append-only history. entity_title snapshots the name at the time, so history
-- still reads well after a task is renamed or deleted.
CREATE TABLE activity_logs (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id  UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    project_id    UUID        REFERENCES projects (id) ON DELETE CASCADE,
    task_id       UUID        REFERENCES tasks (id) ON DELETE SET NULL,
    actor_id      UUID        REFERENCES users (id) ON DELETE SET NULL,
    action        TEXT        NOT NULL,
    entity_title  TEXT        NOT NULL DEFAULT '',
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_workspace_idx ON activity_logs (workspace_id, id DESC);
CREATE INDEX activity_project_idx ON activity_logs (project_id, id DESC) WHERE project_id IS NOT NULL;
CREATE INDEX activity_task_idx ON activity_logs (task_id, id DESC) WHERE task_id IS NOT NULL;
