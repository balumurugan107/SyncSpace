# SyncSpace: Master Prompt for the Next Agent

> Paste this file (or point the agent at it) as the starting instruction. It is the complete handoff:
> the mission, the rules, what is already built and verified, the conventions to keep, the traps
> already found, and a detailed plan for Phases 4–8.
> Last updated: 2026-11-04, end of Phase 3. Repository: `/home/aximsoft/Desktop/AI/SyncSpace` (not a git repo yet).

---

## 0. Your role and mission

Act as a Principal Software Architect and Senior Full-Stack Engineer. You are continuing **SyncSpace**, a
**real, production-oriented, real-time project collaboration platform** (a simplified Trello + Jira + Slack).
It is **not** a system-design tutorial or a set of demos: it is ONE working application whose internal
architecture is made easy to understand (Architecture Explorer, System Health, SYSTEM_DESIGN_GUIDE.md).

**Phases 1–3 are complete and verified. Your job starts at Phase 4.** Build one phase at a time and do
not start the next phase until the current one is implemented, tested, verified in a real browser, and
documented, and the user has asked for the next phase.

### Non-negotiable rules (from the product owner)

1. **No fake infrastructure, no non-functional buttons.** Every integration is real; every visible control works.
   Features from future phases are shown only as clearly labelled, non-clickable "Phase N" items.
2. **The Architecture Explorer must never show something as implemented before it exists.** Status is derived
   from `CURRENT_PHASE` (see §6); a unit test enforces it.
3. **Persist before broadcasting.** Nothing is invalidated, published or pushed before the DB transaction commits.
4. **Authorise every room/endpoint by workspace membership.** Never cache permissions.
5. **Don't lose important notifications silently** (Phase 5: durable queues, retries, DLQ, outbox).
6. **Don't introduce Kafka/Kubernetes/microservices early.** Modular monolith; extract only when a phase says so.
7. TypeScript everywhere, input validation (Zod), central error handling, structured logs (pino), env-based
   config, no hardcoded secrets, migrations, OpenAPI docs, unit + integration tests.

### Mandatory per-phase workflow

**Before implementing:** inspect the repo; explain the proposed architecture, folder changes, data flow,
and why each new technology is needed (short, to the user).

**After implementing:**
1. Explain what was implemented. 2. Show the updated architecture (diagram). 3. Explain how components
communicate. 4. Explain important code. 5. Give commands to run and test. 6. **Verify it works** (tests +
real browser + failure drills). 7. **Update docs:** `SYSTEM_DESIGN_GUIDE.md`, `README.md`, the Architecture
Explorer data, OpenAPI.

The user is a developer learning distributed systems: explanations should be plain and concrete, and
summaries should report what was *verified*, including bugs found and fixed.

---

## 1. Current state at a glance

| Phase | Status | What it delivered |
|---|---|---|
| 1 | ✅ | Repo structure, Docker Compose, PostgreSQL, migrations job, auth (JWT access + rotating refresh cookie), app shell, dashboard, Settings, System Health, Architecture Explorer |
| 2 | ✅ | Workspaces + roles, members, projects, tasks, Kanban (dnd-kit, keyboard), optimistic concurrency, activity history, My Tasks, dashboard |
| 3 | ✅ | Redis: generation-keyed cache, distributed rate limiting, Pub/Sub domain events, heartbeat instance registry, **2 API replicas** with DNS round-robin, System Health cluster view |
| 4 | ⏭ next | Socket.IO: real-time task updates, chat, presence |
| 5–8 | planned | RabbitMQ + workers; MinIO + Elasticsearch; Nginx + Prometheus + Grafana; Kafka + Kubernetes |

Test counts at handoff: **backend 93 passing** (8 files), **frontend 30 passing** (6 files). Stack verified from
a clean `docker compose down -v`.

### Running containers (`docker compose ps`)

| Service | Image | Notes |
|---|---|---|
| `postgres` | `postgres:17-alpine` | volume `postgres-data`; init script creates `syncspace_test` DB on first boot |
| `redis` | `redis:7.4-alpine` | `--requirepass`, no persistence, `maxmemory 256mb allkeys-lru` |
| `migrate` | `syncspace-api:local` | one-shot `node dist/infrastructure/database/migrate-cli.js`, must exit 0 |
| `api` ×2 | `syncspace-api:local` | `deploy.replicas: ${API_REPLICAS:-2}`, host ports `127.0.0.1:4001-4004` (Docker picks per replica) |
| `web` | built from `frontend/` | `vite preview` serving `dist/` + `/api` proxy with DNS round-robin; `127.0.0.1:5173` |

Startup order is enforced by health checks: `postgres + redis healthy → migrate completed → api healthy → web`.

---

## 2. How to run, test, verify

```bash
cd /home/aximsoft/Desktop/AI/SyncSpace
# Docker Desktop must be running. It sometimes stops overnight:
systemctl --user start docker-desktop && docker context use desktop-linux

./scripts/init-env.sh            # creates .env, or appends settings added by later phases (keeps existing secrets)
docker compose up --build -d --wait
# then open http://localhost:5173

# Tests (need postgres + redis containers up)
cd backend  && npx tsc --noEmit && npx vitest run      # uses DB syncspace_test + Redis DB 1 + private channel
cd frontend && npx tsc -b && npx vitest run && npx vite build
```

- **Never print or copy `.env`**: it holds generated secrets. `init-env.sh` must stay idempotent: when you
  add settings (e.g. `RABBITMQ_PASSWORD`), add them to `.env.example` and to the `sed` substitutions in
  `scripts/init-env.sh`, so existing `.env` files get them appended.
- **Browser verification** has been done with `playwright-core` driving the system Chrome
  (`/usr/bin/google-chrome`, headless). Install it in the session scratchpad, **not** in the repo. The
  scratchpad can be wiped between days; reinstall if `ERR_MODULE_NOT_FOUND`.
- **Rate limits during testing:** login/register share 20 attempts / 15 min per IP across instances. Reset with
  `docker compose exec redis sh -c 'redis-cli --scan --pattern "rl:*" | xargs -r redis-cli del'`
  (the container has `REDISCLI_AUTH` set).
- Verification habit that has paid off every phase: **real browser walkthrough (desktop + 390px mobile + dark
  mode), check no console errors, check no horizontal page overflow, failure drills** (stop a dependency/replica,
  check behaviour and recovery), and for concurrency fixes, **prove the test fails without the fix**.

---

## 3. Toolchain versions (newer than you may expect; check APIs before assuming)

Node 22.12, npm 10.9, Docker 29 / Compose v5 (Docker Desktop, context `desktop-linux`).
Backend: Express **5.x**, pg 8, **zod 4** (`z.email()`, `z.uuid()`, `z.iso.date()`), jose 6, bcryptjs 3,
pino 10 / pino-http 11, **ioredis 6** (`import { Redis } from 'ioredis'`, v5-compatible options), swagger-ui-express,
TypeScript ~5.9, **vitest 5** (vitest 3 had advisories; keep latest), supertest. ESM (`"type": "module"`,
`NodeNext`, `.js` import suffixes, top-level await in `server.ts`).
Frontend: React 19, react-router 7, **Vite 8 (rolldown)**, `@vitejs/plugin-react` 6, **Tailwind 4** (`@tailwindcss/vite`,
`@theme inline` tokens, `.dark` class), shadcn/ui components hand-written in `components/ui` (Radix), TanStack
Query 5, `@xyflow/react` 12, dnd-kit (core 6 / sortable 10), sonner 2, **lucide-react 1.x** (verify icon names exist
with `node -e "console.log(Boolean(require('lucide-react').IconName))"` before using).
Always run `npm audit` after installs; keep it at 0 vulnerabilities.

---

## 4. Architecture you are inheriting

```
Browser ─▶ web (static + /api proxy, DNS round-robin, keep-alive off) ─┬─▶ api replica 1 ─┐
                                                                       └─▶ api replica 2 ─┤─▶ PostgreSQL (source of truth)
                                                                                          └─▶ Redis (cache · rate limits · pub/sub · heartbeats)
```

### Backend layout (`backend/src`): modular monolith

- `app.ts`: Express factory: pino-http (request id, `x-request-id`) → `x-served-by` + request counter →
  helmet → cors (exposes custom headers) → json(100kb) → cookies → `/api/health` (before limiter) →
  global `rateLimit({name:'api'})` → module routers → `/api/docs` → 404 → error handler.
- `server.ts`: resolves instance name, `eventBus.subscribe(recordReceivedEvent)` + `eventBus.start()`,
  `startHeartbeat()`, listen; graceful SIGTERM: close server → `stopHeartbeat()` → `eventBus.stop()` →
  `closeRedis()` → `closePool()`, force-exit after 10 s.
- `config/env.ts`: **every** env var is declared and Zod-validated here; process refuses to start if invalid.
- `infrastructure/`: technical adapters, no business rules:
  - `database/`: pool, `withTransaction`, migrator with checksums + advisory lock, migrate-cli.
  - `redis/redis.ts`: fail-fast clients: `redis` for commands, `redisSubscriber` for SUBSCRIBE.
  - `cache/cache.ts`: `createCache(client, ttl)` → `read(name, scopes, loader)` / `invalidate(scopes)`.
  - `rate-limit/rate-limit.ts`: fixed-window Redis limiter middleware, fail-open.
  - `events/event-bus.ts`: `createEventBus` → `publish` / `subscribe` / `start` / `stop`, dedupe by id; `events/index.ts` holds the singleton.
  - `instance.ts`: `instance.id` via PTR lookup (→ `syncspace-api-1`) and the `metrics` counters.
  - `logging/logger.ts`: pino with redaction.
- `shared/`: `errors/app-error.ts` (`AppError`, `Errors.*`), `middleware/` (`validateBody`, `authenticate` +
  `requireUser`, error handler), `http/params.ts` (`uuidParam` → 404 on malformed ids),
  **`after-commit.ts`** (`afterCommit({type, workspaceId, projectId?, taskId?, actorId, scopes})` = invalidate cache
  generations, then publish domain event; `invalidate(scopes)` for non-workspace changes).
- `modules/`:
  - `auth`, `users`, `health`.
  - `workspaces`, including **`workspace-access.ts`** (`requireWorkspaceRole`, the single authorisation gate).
  - `projects` (`requireProjectAccess`), `tasks` (`positioning.ts`: fractional order), `activity`.
  - `me` (my tasks + dashboard), `system` (instance registry, event log, routes).

  Pattern per module: `*.schemas.ts` (Zod) → `*.routes.ts` (thin) → `*.service.ts` (rules, transactions) →
  `*.repository.ts` (explicit SQL, no ORM). Modules talk only through exported services/repositories.
- `docs/openapi.ts`: hand-written OpenAPI 3.1; `tests/integration/system.test.ts` asserts every documented path is mounted.
- `backend/migrations/NNN_name.sql`: plain SQL, applied in order; **never edit an applied migration** (checksum check);
  add a new file. Current: `001_create_users_and_refresh_tokens.sql`, `002_workspaces_projects_tasks.sql`.

### Frontend layout (`frontend/src`)

- `lib/api-client.ts`: fetch wrapper; access token in memory only; on `401 TOKEN_EXPIRED` refreshes once
  (deduped in-flight) and retries; handles the `REFRESH_TOKEN_STALE` multi-tab race; `api.get/post/patch/delete`.
- `lib/queries.ts`: health, sessions, cluster (`/system/instances`), bus events (`/system/events`).
- `features/auth/auth-provider.tsx`: restores session via refresh cookie on load; `useAuth`, `useCurrentUser`.
- `features/work/`: shared domain layer:
  - `types.ts`.
  - **`api.ts`**: query keys `keys.*` and all queries/mutations. `useWorkMutation` invalidates on **settled**; `useMoveTask` does an optimistic update with rollback.
  - `task-meta.tsx`: badges and due-date helpers (no timezone shift).
  - `activity-feed.tsx`: `describeActivity`.
- `features/board/`:
  - `kanban-board.tsx`: dnd-kit with several columns; local drag columns are kept until the optimistic cache lands.
  - `board-logic.ts`: pure functions: grouping, anchors, a client copy of the server's position rule, filters.
  - `task-sheet.tsx`: driven by the URL `?task=<id>`; plus the dialogs.
- `features/{workspaces,projects,tasks,dashboard,settings,health,architecture}`.
- `components/layout/navigation.ts`: **`CURRENT_PHASE`** + nav items with `phase`; unbuilt pages render as
  disabled "Phase N" items (tested in `sidebar.test.tsx`).
- `vite.config.ts`: `/api` proxy with a custom `roundRobinLookup` (`dns.resolve4` → rotate) and `keepAlive:false`;
  manual chunks `vendor`, `react-flow`, `dnd-kit`; the Board and Architecture pages are lazy-loaded.

### Data model (PostgreSQL)

- `users`.
- `refresh_tokens`: hash only, `family_id`, rotation and reuse detection.
- `workspaces`.
- `workspace_members`: role `owner|admin|member`; exactly one owner, enforced by a partial unique index.
- `projects`: immutable `key`, plus `task_counter`.
- `tasks`: `status` (TODO / IN_PROGRESS / IN_REVIEW / COMPLETED), `priority`, `position` (float), `version`, and a denormalised `workspace_id`.
- `activity_logs`: BIGINT identity, `entity_title` snapshot, JSONB metadata.
- `schema_migrations`.

### Redis keyspace

| Key | Purpose |
|---|---|
| `gen:project:<id>`, `gen:workspace:<id>`, `gen:users` | cache generations (INCR after commit) |
| `cache:<name>\|<scope>=<gen>…` | cached board / project header / member list (300 s) |
| `rl:<limiter>:<ip>:<window>` | rate-limit counters (`auth` 20/15 min, `api` 1200/min) |
| `instance:<id>` | heartbeat report, TTL 15 s, every 5 s |
| channel `syncspace:events` | domain events `{id,type,workspaceId,projectId,taskId,actorId,occurredAt,publishedBy}` |

Tests use Redis **DB 1** and channel `syncspace:test:events` (see `backend/tests/setup-env.ts`); keep it that way
so tests never pollute the running stack.

### Key behaviours already implemented (keep them true)

- **Auth:**
  - A 15-minute JWT (HS256, with issuer and audience checks) kept in browser memory.
  - A refresh token in an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie, stored in the database as a SHA-256 hash.
  - Rotation happens in a transaction with `FOR UPDATE`. Reusing a rotated token after the 30-second grace period revokes the whole login family.
  - Unknown emails are checked against a dummy bcrypt hash, so timing doesn't reveal which accounts exist.
- **Authorisation:** non-member → **404** (not 403); role too low → 403. Owner cannot be demoted/removed/leave.
- **Concurrency:** `version` on tasks → `409 VERSION_CONFLICT`; board writes lock **project (`FOR NO KEY UPDATE`)
  then task**, always in that order (a deadlock test proves it).
- **Caching:** data only, never permissions; role merged live into the cached project; invalidation via `afterCommit`
  *before* responding.
- **Degradation:** Redis down → cache BYPASS, rate limits fail open, events skipped, readiness 200 "degraded";
  Postgres down → readiness 503.

---

## 5. Traps already found (don't rediscover them)

1. **Lock ordering + FK locks:** inserting a row that references `projects` takes `KEY SHARE`; locking projects
   with `FOR UPDATE` deadlocks against that. Use `FOR NO KEY UPDATE`, project → task order everywhere.
2. **Throwing inside `withTransaction` rolls back.** If you must commit a side effect and then return an error
   (e.g. refresh reuse revocation), return the error out of the transaction and throw after.
3. **Never `DEL` cache keys after writes**: use `afterCommit` scopes (generation INCR). Readers racing writers
   can't poison the cache that way.
4. **TanStack Query v5 callback order:** hook-level `onSettled` (refetch) runs before `mutate(…, {onError})`; don't
   reset form state from stale closures in mutate-level callbacks.
5. **`position: absolute` sr-only text inside a horizontal scroller escapes it** and widens the page on phones.
   The scroller must be `relative`.
6. **React Flow nodes:** negative `z-index` children disappear; draw stacked layers via DOM order. Highlight
   styling (scale + ring) covers ~8 px.
7. **Docker DNS:** `dns.reverse()` returns `[]`; use `dns.resolve(<arpa>, 'PTR')`. Docker drops stopped replicas
   from DNS immediately.
8. **Vite preview inside the container runs as `node`**: it writes a temp config next to `vite.config.ts`, so
   `/app` must be owned by `node` (already in the Dockerfile).
9. **Playwright selectors:** Radix modals leave background controls in the DOM; scope with
   `page.getByRole('dialog')`. The suggested project key for a one-word name is its first 3 letters (`Compiler` → `COM`).
10. **Fixed waits in browser scripts cause flakes**: poll for the expected state.
11. Express 5 forwards async errors automatically: no `asyncHandler` wrappers needed.
12. `noUncheckedIndexedAccess` is on (both packages): index access returns `T | undefined`.

---

## 6. Keeping the Architecture Explorer and docs honest (checklist per phase)

1. `frontend/src/components/layout/navigation.ts`: bump `CURRENT_PHASE`; set `phase` on nav items that become live.
2. `frontend/src/features/architecture/architecture-data.ts`: components, connections and flows all carry a
   `phase`. Rewrite newly live components from "will/planned" to "does", with **real** keys, commands and code
   from the implementation, and real failure behaviour. Add flows for the phase's key paths.
   (`replicas: { count, phase }` draws a stack for scaled components.)
3. `architecture-data.test.ts`: extend the `expected` map for the new phase (the test fails until the diagram
   matches what Compose runs). The integrity test forbids implemented flows from using planned nodes/edges.
4. `/api/health/ready` + System Health page: add each new dependency, marking whether it is critical (503) or not.
5. `SYSTEM_DESIGN_GUIDE.md`:
   - the status line and the capability table;
   - §2 diagrams, components and why-each-technology; §3 repository layout;
   - §4 communication patterns, REST table and headers; §5 data model and Redis keyspace;
   - §6 key flows; §7 security; §8 failure scenarios (measured where possible); §9 trade-offs;
   - §10 configuration; §11 tests; §13 roadmap ✅.
6. `README.md`: current build line, URLs table, "watch Phase N at work", troubleshooting.
7. `backend/src/docs/openapi.ts`: new paths (a test checks every documented path is mounted).
8. `.env.example` + `scripts/init-env.sh` for any new secret/setting.

---

## 7. To-do: remaining phases (detailed plan)

### Phase 4: Socket.IO: real-time task updates, chat, presence

**Goal:** User A moves a card; every other member viewing that board sees it move without refreshing, whichever
API replica they are connected to. Team chat and "who's online" work across replicas.

**Backend**
- Add `socket.io` (and possibly `@socket.io/redis-adapter`) and attach it to the existing HTTP server in `server.ts`
  (`path: '/api/socket.io'`, so the existing `/api` proxy carries it).
- **Handshake auth:** the client sends the in-memory access token in `auth.token`; verify with
  `verifyAccessToken`; reject otherwise. On `TOKEN_EXPIRED` the client refreshes and reconnects.
- **Rooms:**
  - `user:<id>` and `workspace:<id>`. Join a workspace room only after `requireWorkspaceRole`.
  - Provide `join-workspace` / `leave-workspace` events that ack with an error if the user isn't a member.
  - On member removal (`member.removed` event), **evict the removed user's sockets from the room** on every instance.
- **Fan-out:** reuse the Phase 3 event bus. Add a second subscriber handler: on each domain event, emit to
  `workspace:<workspaceId>` **on this instance only**. Each instance already receives every event, so use a local
  emit (e.g. `io.local.to(room).emit(...)`) to avoid N× duplicates. Alternatively, use the Redis adapter for emits
  and stop handling bus events per instance. Pick one, document why, and test that nothing is delivered twice.
- **Event payload to browsers:** `{ id, type, workspaceId, projectId, taskId, actorId, occurredAt }` (ids only);
  clients refetch or patch through the existing queries. You may include the updated task for `task.*` events, but
  the payload must be built **after commit** and must not leak data to non-members.
- **Chat** (new module `chat`):
  - Migration `003_chat.sql`:
    - `channels`: workspace-scoped, with a default `#general` per workspace and a backfill for existing workspaces.
    - `messages`: id, channel_id, author_id, body ≤ 4000, created_at, edited_at?, plus `client_id` for idempotency with `UNIQUE (channel_id, client_id)`.
  - REST: list channels, list messages (keyset pagination), post a message (`afterCommit` publishes `chat.message`).
  - Socket: `chat:send` with ack → persist first → publish → broadcast to the channel or workspace room.
  - Typing indicators: ephemeral, not persisted, throttled.
- **Presence:**
  - Track it in Redis with a TTL that is refreshed while connected, e.g. `presence:user:<id>` holding that user's socket ids, or a sorted set `presence:workspace:<id>` scored by last seen.
  - Count multiple tabs as one user.
  - A crashed instance must not leave users "online" forever; the TTL handles that.
  - Emit `presence.changed` to workspace rooms, and add an endpoint (REST or WebSocket) that returns the members currently online.
- Rate-limit socket messages per user (Redis fixed window; reuse the limiter logic).
- `/api/system`: add socket counts per instance to the heartbeat report.
- **Comments** (in the original spec, not yet built) fit here or in Phase 5:
  - a `task_comments` table and REST CRUD;
  - `comment.created` events;
  - shown in the task sheet.

**Frontend**
- `socket.io-client`: a `RealtimeProvider` connects with the access token after login and reconnects with backoff.
  On reconnect, **refetch** the active queries, because events missed while disconnected are not replayed.
- **Board:** on a `task.*` event for the open project, invalidate `keys.board(projectId)` (or apply the patch)
  without disturbing an in-progress drag; queue updates while dragging. Show a subtle "updated by X" pulse.
  The task sheet refetches when its task changes and keeps the version-conflict UX.
- **Team Chat page** (nav item becomes phase 4): channel list, messages with infinite scroll upward, composer with
  optimistic send (`client_id`), typing indicator, unread counts.
- **Presence:** avatars with a green dot on the board, members list and chat; "N online" in the workspace header.
- Replace the board's "Teammates' changes appear when you refocus…" hint.
- System Health: connected sockets per instance.

**Infra/compose:**
- WebSockets go through the Vite preview proxy: add `ws: true` to the `/api` proxy, and verify the upgrade works with the custom agent/lookup.
- **Sticky sessions:**
  - Not required if the client uses `transports: ['websocket']`.
  - With long-polling, every request of a session must reach the same replica, and DNS round-robin can't guarantee that.
  - Prefer websocket-only and document why; Nginx in Phase 7 can add `ip_hash` if needed.

**Tests:**
- Two Socket.IO servers on two app instances sharing Redis: a client on instance A receives an event caused by a write on instance B exactly once.
- A non-member cannot join a room, and a removed member is evicted.
- A chat message is persisted before it is broadcast (stop the database → no broadcast).
- Resending with the same `client_id` is idempotent.
- Presence expires via TTL, and an expired token gives a connect error.
- Browser: two contexts (Ada and Bob) on the same board; a drag in one shows up in the other with no reload; a chat round-trip works across replicas.

**Explorer:**
- The `socket` component and the `browser-socket`, `socket-api` and `socket-redis` edges become phase 4.
- The "Real-time task updates" and "Chat messaging" flows become implemented; rewrite their steps to match the code.
- Add a "Presence" flow.

### Phase 5: RabbitMQ, background workers, notifications, retries, DLQ

- **Compose:**
  - `rabbitmq` with the management plugin, credentials from `.env`, a healthcheck, and the management UI on `127.0.0.1:15672`.
  - A new scalable `worker` service, built from the backend image with its own entrypoint (`dist/worker.js`).
- **Transactional outbox:**
  - An `outbox` table, written in the same transaction as the business change.
  - A relay publishes the rows to RabbitMQ with **publisher confirms** and marks them sent.
  - This is how "don't lose notifications silently" holds even if RabbitMQ is down at commit time.
- **Topology:**
  - A topic exchange `syncspace.events`.
  - Queues `notifications`, `email`, and later `search-index` and `file-processing`.
  - For each queue, a retry queue with a TTL that dead-letters back to the main queue (with backoff tiers), and a final DLQ after N attempts.
  - Manual ack, prefetch, and idempotent consumers (a `processed_messages` table or a unique constraint on the message id).
- **In-app notifications:**
  - Triggers: task assigned, mentioned in a comment or chat, task due soon.
  - A `notifications` table and REST endpoints (list, mark read, unread count).
  - A Notification Center page (nav item becomes phase 5).
  - Live delivery: worker → Redis Pub/Sub → API instances → the `user:<id>` room.
- **Email:**
  - Use a real SMTP sink in Compose (e.g. Mailpit), so emails are real and inspectable, not faked.
  - Email invitations to workspaces for people without accounts (with invite tokens) can now be built.
- **Scheduled jobs** (due-soon reminders): a scheduler in the worker, with a Redis or DB lock so only one worker runs it.
- **System Health:** queue depth, consumers and DLQ size (from the RabbitMQ management API), plus worker heartbeats in the registry.
- **Tests:**
  - A failing job is retried, then lands in the DLQ after N attempts.
  - A duplicate delivery is processed once.
  - The outbox survives RabbitMQ downtime.
  - A notification is delivered live across replicas.
- **Explorer:** the `rabbitmq` and `workers` components and the "Background notification processing" flow.

### Phase 6: MinIO / S3 file uploads + Elasticsearch search

- **Compose:**
  - `minio` (with its console) and a bucket bootstrap step.
  - `elasticsearch` single-node with security settings, memory limits and a healthcheck.
  - Both are non-critical for the core flows; decide and document their readiness criticality.
- **Uploads:**
  - An `attachments` table.
  - `POST /attachments/presign`:
    - authorised by membership of the task's workspace;
    - size and type limits;
    - a 5-minute pre-signed PUT;
    - an object key namespaced by workspace.
  - The browser uploads directly to MinIO.
  - `POST /attachments/:id/complete`: verify the object (HEAD), store its metadata, and queue a `file-processing` job (e.g. image thumbnails).
  - Downloads use short-lived pre-signed GETs.
  - Use `@aws-sdk/client-s3`, so switching to AWS S3 is configuration only.
  - The web proxy and CSP must allow the MinIO origin, or proxy it.
- **Search:**
  - Index tasks, comments and chat messages asynchronously: `afterCommit`/outbox → `search-index` queue → a worker upserts or deletes documents in Elasticsearch.
  - `GET /api/search?q=&type=` must **filter by the caller's workspace ids**; never return documents from other workspaces.
  - Add a reindex command that rebuilds the index from PostgreSQL.
  - When Elasticsearch is down, either show an error state or fall back to PostgreSQL full-text search; document the choice.
- **UI:** attachments in the task sheet (drag and drop, progress, previews) and a global search (⌘K) with highlighted results.
- **Explorer:** the `minio` and `elasticsearch` components and the "File upload" and "Search indexing" flows.

### Phase 7: Nginx load balancing, Prometheus, Grafana

- **Nginx** replaces the `web` container's proxy:
  - Serve the built SPA.
  - Upstream `least_conn` across the API replicas, with re-resolution through Docker DNS (`resolver 127.0.0.11 valid=5s;`).
  - Passive health checks (`max_fails`, `fail_timeout`).
  - WebSocket upgrade for `/api/socket.io`, gzip, security headers, request-id propagation.
  - Keep same-origin cookies.
  - Update the explorer (a web → nginx edge) and retire the vite-preview server, or keep it for development only.
  - Demonstrate that a **hung** replica is now taken out of rotation (the Phase 3 limitation).
- **Prometheus:**
  - `prom-client` in the API and the workers: HTTP request count and duration histograms by route and status, and error rate.
  - The counters already in `metrics`: cache hits/misses/bypass, rate-limited requests, event bus traffic.
  - Socket connections and queue depth (RabbitMQ exporter or management API).
  - PostgreSQL metrics (`postgres-exporter`) and Redis metrics (`redis-exporter`).
  - Scrape every replica through Docker DNS service discovery.
- **Grafana:** a provisioned datasource and dashboards as code (JSON in the repo) for API overview (RPS, p95, 5xx), cache, queues, workers and DB, plus a couple of alert rules.
- **System Health page:** link to Grafana, and optionally show key Prometheus queries.
- **Tests and drills:** kill a replica under load and check p95 stays visible; validate the config with `nginx -t`.

### Phase 8: Kafka, Kubernetes, advanced scaling and reliability

- **Kafka** for high-volume event streaming and analytics only; keep RabbitMQ for task queues.
  - Stream domain events from the outbox into a topic.
  - An analytics consumer builds aggregates (tasks completed per day, cycle time, throughput per project) into PostgreSQL tables, covering the "Dashboard and analytics" requirement.
  - Show consumer lag.
  - Explain why Kafka here (replay, retention, multiple consumer groups) rather than RabbitMQ.
- **Kubernetes:** manifests or a Helm chart, run locally with kind or minikube:
  - Deployments for api, worker and web.
  - StatefulSets (or managed services) for Postgres, Redis, RabbitMQ and Kafka.
  - Readiness and liveness probes mapped to `/api/health/*`.
  - An HPA on CPU or RPS.
  - ConfigMaps and Secrets (no secrets in git).
  - A migration Job, PodDisruptionBudgets, and an Ingress replacing the Nginx container.
- **Reliability:**
  - Graceful shutdown already exists.
  - Add circuit breakers and timeouts around external calls.
  - Run chaos drills, add PostgreSQL backup and restore, and run a load test (k6) with the results recorded in the guide.
- Extract a module into a separate service only if there is a measured reason (e.g. search indexing or notifications), and document the boundary.

### Cross-cutting backlog (not yet done, pick up when relevant)

- "Dashboard and analytics": current dashboard has counts; richer analytics belong to Phase 8 (or earlier with SQL).
- Task comments and mentions; workspace email invitations (Phase 5); file attachments (Phase 6).
- JWT revocation window (≤ 15 min after logout): optional Redis denylist of `jti`.
- The Redis password is visible on the `redis-server` command line (`docker inspect`); move it to a config file or ACL.
- CI pipeline (GitHub Actions: typecheck, tests with service containers, build images). Run `git init` and make a first commit only when the user asks; the folder is not a git repo yet.
- E2E tests are ad-hoc playwright scripts in the scratchpad; consider adding a committed Playwright suite.

---

## 8. Definition of done for any phase

- [ ] Feature works end-to-end in the browser for **two users** where relevant, across **both API replicas**.
- [ ] Backend unit + integration tests added (including authorisation, failure and concurrency cases); all green.
- [ ] Frontend tests for new pure logic; architecture integrity test updated; all green; `vite build` has no warnings.
- [ ] Failure drills run (stop the new dependency; stop a replica), behaviour matches the docs, recovery automatic.
- [ ] No console errors, no mobile overflow, dark mode checked.
- [ ] `npm audit` 0 vulnerabilities in both packages.
- [ ] Docs/explorer/OpenAPI/README/.env.example/init-env updated (checklist §6).
- [ ] Clean-slate run: `docker compose down -v && docker compose up --build -d --wait` all healthy, tests pass.
- [ ] Final report to the user: what was built, diagram, how it communicates, important code, commands,
      what was verified (with numbers), bugs found and fixed, honest limitations. Then stop and wait.
