# SyncSpace — Project Understanding

Last assessed: **2026-11-20 (Asia/Kolkata)**. Baseline: **Phases 1–4 implemented**.

For a simple illustrated explanation of the **historical Phase 3 baseline**, read [SyncSpace Architecture — Simple PDF](docs/SyncSpace_Architecture_Simple.pdf): browser-to-database flow, creating/reading tasks, login, Redis and multiple API copies.

This report describes the repository inspected for this assessment. Implementation status is based on source, configuration and the checks recorded in [IMPLEMENTATION_TRACKER.md](IMPLEMENTATION_TRACKER.md). Test success and user approval are separate states. Phase 4 was authorized on 2026-11-05. Phase 5 has not started.

## 1. Product and repository

SyncSpace is an existing collaboration application with authentication, workspaces, projects, tasks, Kanban boards and activity history. Live task updates, workspace chat, presence and transient change notifications are implemented. A durable notification inbox and background email jobs remain planned.

| Location | Responsibility |
|---|---|
| `frontend/src` | React SPA, UI primitives, feature screens, query hooks and Architecture Explorer |
| `backend/src` | Express modular monolith, domain services, SQL repositories and infrastructure adapters |
| `backend/migrations` | Ordered SQL migrations: `001_create_users_and_refresh_tokens.sql`, `002_workspaces_projects_tasks.sql` |
| `backend/tests` | Unit and real PostgreSQL/Redis integration tests |
| `docker/postgres/init` | Creates isolated `syncspace_test` database on initial PostgreSQL volume setup |
| `docker-compose.yml` | PostgreSQL, Redis, migration job, API replicas and web service |
| `scripts/init-env.sh`, `.env.example` | Local environment setup and documented configuration; never copy secret values into documentation |
| `README.md` | Setup, development and operational commands |
| `SYSTEM_DESIGN_GUIDE.md` | Detailed architecture, diagrams, flows and trade-offs |
| `AGENT_HANDOFF.md` | Historical Phase 3 handoff; its eight-phase roadmap predates the current eleven-phase brief |

There is no root package/workspace script: frontend and backend have independent npm manifests and lockfiles. As of 2026-11-20 this directory is a Git repository, with `origin` configured to `https://github.com/balumurugan107/SyncSpace.git`. The remote initially contained only its README; the local application files were untracked. The original documentation assessment predates this Git setup.

## 2. Existing architecture

The browser calls one origin. The web container serves the SPA through Vite preview and proxies `/api` to stateless Express instances using Docker DNS and a custom round-robin lookup. PostgreSQL is authoritative. Redis holds shared cache entries, invalidation generations, rate-limit counters, transient domain events and instance heartbeats.

This is a modular monolith, not a set of business microservices. Keeping transactions and authorization within one API preserves the existing design and is appropriate for the current scope. See the [system diagram](SYSTEM_DESIGN_GUIDE.md#2-architecture-as-implemented-through-phase-4).

## 3. Frontend architecture

- **Stack:** React 19, TypeScript, Vite 8, React Router 7, TanStack Query 5, Tailwind CSS 4, Radix primitives, Lucide icons and Sonner toasts. These versions are declared in `frontend/package.json`.
- **Composition:** `main.tsx` installs theme, query, router and auth providers; `App.tsx` defines authenticated and anonymous routes. Board and Architecture Explorer are lazy-loaded.
- **Features:** auth, dashboard, workspaces/members, projects, board/task details, My Tasks, settings, system health and architecture. Shared work API hooks/types live in `features/work`.
- **State:** TanStack Query owns server data; React component state owns dialogs, filters and selection; AuthProvider owns session state. Access token is stored in module memory in `lib/api-client.ts`. There is no Redux store.
- **Networking:** typed fetch wrapper uses `/api`, same-origin credentials and Bearer tokens; expired access tokens trigger one shared refresh and retry. Query defaults use 30-second freshness and limited retries for non-4xx failures.
- **Mutations:** work mutations invalidate related query families. Board moves cancel pending reads, optimistically reorder cards, restore a snapshot on failure and refetch after settling. The browser sends task versions to detect concurrent edits.
- **Updates from teammates:** sockets deliver ID-only change signals; queries refresh after a 100 ms batching interval. Dragging defers those refreshes until drop. Stale queries can also refresh on window focus; boards retain a manual refresh action. RealtimeProvider maintains an authenticated WebSocket, joins authorized workspace rooms and reconciles affected queries on change/reconnect. Health/cluster/event panels continue to poll over HTTP.

### Routes

`/login`, `/register`; protected `/`, `/workspaces`, `/workspaces/:workspaceId`, `/projects`, `/projects/:projectId`, `/tasks`, `/architecture`, `/health`, `/settings`. `/chat` provides a workspace conversation with history and a composer. The durable notifications page remains disabled for Phase 5. `CURRENT_PHASE = 4` controls availability.

## 4. Backend architecture

`app.ts` builds the Express app; `server.ts` creates the HTTP server, subscribes to domain events, starts heartbeats and handles shutdown. Modules contain routers, Zod schemas, services and SQL repositories where appropriate.

Request pipeline: request logging/ID → instance header → Helmet → CORS → JSON/cookies → health routes → distributed API limiter → feature router → authentication/validation → service → repository → centralized errors. Health probes bypass the limiter. Credential endpoints have an additional shared limiter.

| Module | Existing responsibility |
|---|---|
| `auth`, `users` | Registration, login, token rotation/revocation, sessions and profile |
| `workspaces` | CRUD, membership and shared role gate |
| `projects` | CRUD, immutable workspace-unique project keys and project access checks |
| `tasks` | CRUD, assignment, version checks, fractional positions and board reads |
| `activity` | History persistence and bounded history reads |
| `me` | Assigned tasks and dashboard aggregation |
| `chat` | Membership-protected message history/sends and online member snapshots |
| `health`, `system` | Liveness/readiness, instance registry and membership-filtered event inspection |

Shared helpers implement parameter parsing, Zod body validation, application errors, transactions and post-commit invalidation/publication. Pino logs structured JSON with configured credential redaction. Errors generally return `{ error: { code, message, details?, requestId } }`; unmatched routes use a simpler 404 body.

## 5. Database and migrations

| Table | Purpose and key relationships |
|---|---|
| `users` | Unique lowercase email, bcrypt password hash, display name, timestamps |
| `refresh_tokens` | SHA-256 token hashes, user/session family, expiry, revocation and replacement link |
| `workspaces` | Workspace identity, description, creator |
| `workspace_members` | Composite workspace/user key; owner/admin/member role; unique partial index permits at most one owner |
| `projects` | Workspace FK, immutable key unique within workspace, atomic task counter |
| `tasks` | Project/workspace FKs, per-project number, status, priority, assignee/reporter, date, position and version |
| `activity_logs` | Workspace/project/task/actor references, action, title snapshot and JSONB metadata |
| `chat_messages` | Workspace conversation, author, body, client send UUID and keyset history index; migration `003_workspace_chat.sql` |
| `schema_migrations` | Applied filenames, SHA-256 checksums and timestamps, created by the migration runner |

Task states: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `COMPLETED`; priorities: `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Indexed board reads order by project/status/position. PostgreSQL DATE values are returned as `YYYY-MM-DD` strings to preserve calendar dates.

Repositories use parameterized SQL through `pg`; there is no ORM. Each process has a pool (default maximum 10), so total connections grow with replica count. `withTransaction` commits or rolls back and releases clients. Task mutations lock project before task to serialize board writes consistently. Activity rows are recorded in the same transaction as the change.

Migrations run in filename order, one transaction per file, under a PostgreSQL advisory lock. Checksums reject edits to applied files. Add a new migration for every future schema change. Compose runs migration as a one-shot job before APIs start.

## 6. API structure

All paths below are prefixed with `/api`; exact schemas are in `backend/src/docs/openapi.ts` and available at `/api/docs`.

| Resource | Mounted operations |
|---|---|
| `/auth` | POST register/login/refresh/logout/logout-all; GET sessions |
| `/users/me` | GET profile; PATCH display name |
| `/workspaces` | GET list; POST create; GET/PATCH/DELETE `/:workspaceId` |
| `/workspaces/:workspaceId/members` | GET/POST; PATCH/DELETE `/:userId` |
| `/workspaces/:workspaceId/projects` | GET/POST |
| `/projects` | GET accessible projects; GET/PATCH/DELETE `/:projectId` |
| `/projects/:projectId/tasks` | GET board; POST task |
| `/tasks/:taskId` | GET/PATCH/DELETE; POST `/move` |
| Workspace/project/task `/:id/activity` | GET history |
| `/me/tasks`, `/me/dashboard` | GET assigned tasks and dashboard |
| `/chat/:workspaceId/messages` | GET paginated history; POST idempotent send |
| `/chat/:workspaceId/presence` | GET online user IDs and availability |
| `/health/live`, `/health/ready` | GET process/dependency health |
| `/system/instances`, `/system/events` | Authenticated GET cluster and scoped transient events |

Workspace authorization always queries PostgreSQL before serving cached domain data. Nonmembers receive 404; insufficient roles receive 403. Members can create/edit/move tasks; task deletion requires its reporter or workspace admin/owner. Version mismatches return 409 when callers supply a version; versions are optional for API scripts, so conflict prevention is not universal.

## 7. Authentication flow

1. Register/login validates input and verifies or stores a bcrypt password hash.
2. API issues a short-lived signed JWT and a random refresh token. Only the refresh token hash is stored in PostgreSQL.
3. Browser keeps JWT in memory. Refresh token is an HttpOnly, SameSite=Strict cookie scoped to `/api/auth`; secure-cookie mode is configurable for HTTPS deployments.
4. Protected HTTP calls use a Bearer token. Reload or expiry restores the session through the refresh cookie.
5. Refresh locks the token row and atomically issues a successor and revokes the old token. A brief rotation race returns `REFRESH_TOKEN_STALE`; later reuse revokes the family.
6. Logout revokes a session family; logout-all revokes the user's refresh sessions. Existing JWTs remain valid until expiry (default 15 minutes).

## 8. Infrastructure and runtime behavior

| Integration | Actual use | Failure behavior |
|---|---|---|
| PostgreSQL 17 | All durable domain/session data and activity | Readiness 503; affected domain requests fail |
| Redis 7.4 | Cache-aside, generation invalidation, fixed-window shared limits, Pub/Sub, TTL registry | Cache bypass; rate limits fail open; events may be lost; readiness 200 degraded |
| Multiple APIs | Compose default two replicas, `x-served-by` header, shared DB/Redis | Current proxy lacks health-aware routing/retry |
| Event bus | After SQL commit, invalidate affected generations, then publish an ID-based event; local subscribers deduplicate recent IDs and record bounded diagnostic history | At-most-once, no durable replay or outbox |
| Background workers/queues | None | RabbitMQ and workers are planned |
| Browser real-time transport | Socket.IO attached to each API at `/api/socket.io`, WebSocket-only; existing domain-event bus fans out once, then authorized local sockets receive signals | Backoff reconnect and query refetch; degraded status on Redis subscription loss; no replay |

Cached views are project headers, boards and member lists (`x-cache: HIT/MISS/BYPASS`). Scope generations cover project, workspace and user display-name changes. Post-commit operations are best-effort: SQL success survives Redis failure, but cache may remain stale until TTL.

### Docker services

`postgres` has the named `postgres-data` volume; Redis disables persistence and uses a 256 MB `allkeys-lru` policy. `migrate` exits after applying SQL. `api` uses a multi-stage backend image; `web` builds the frontend and runs Vite preview. Ports bind to loopback. PostgreSQL/Redis health and successful migrations gate API startup; API readiness gates web startup. Runtime Redis degradation is tolerated even though initial Compose startup requires healthy Redis.

On 2026-11-04, `docker compose ps` confirmed healthy PostgreSQL, Redis, web and two API containers (direct ports 4003 and 4002). This is a runtime snapshot, not a deployment guarantee. No RabbitMQ, object storage, Elasticsearch, Nginx, Kafka, Prometheus, Grafana or Kubernetes configuration is implemented in this repository.

## 9. Existing UI design system

Chat presentation updated on **2026-11-16 (Asia/Kolkata)**: `frontend/src/features/chat/chat-page.tsx` now provides desktop workspace navigation and a member roster, a mobile workspace picker, incoming/outgoing message bubbles, local-calendar date separators and a framed composer with Ctrl/Command+Enter submission. It retains semantic theme tokens, shared UI primitives, authenticated HTTP history/sends, retry client IDs, pagination and existing Socket.IO invalidation/typing/presence. Member online dots only appear for users reported online while connected. No unread counts, read receipts, attachments or new chat API/schema are introduced. Taste skill `design-taste-frontend` was installed from `Leonxlnx/taste-skill`; existing application design requirements take precedence over its marketing-page palette/hero prescriptions. Verification and limits are recorded in the tracker.

Source-reviewed in `index.css`, layout, UI primitives and feature screens. On 2026-11-05, Playwright verified live boards, chat, presence, the Explorer and desktop/mobile chat layout; desktop and 390 px screenshots were visually inspected.

- Light/dark semantic OKLCH tokens: cobalt primary, warm neutral surfaces, graphite navigation and semantic success/warning/destructive colors; base radius 0.75rem. Existing token names and component APIs are retained.
- Locally hosted Inter variable font with system fallbacks, a shared heading/spacing scale, Lucide icons and consistent button variants. Font license ships under `frontend/public/fonts`.
- Desktop sticky 244px graphite sidebar with an existing-query workspace switcher; mobile focus-managed Radix navigation drawer; sticky 68px contextual header; skip-to-content link, responsive main padding and wrapping page actions.
- Reuse `components/ui` Radix-based dialogs, selects, tabs, menus, avatars, cards, inputs, alerts and skeletons. Forms support field errors; destructive actions use confirmation dialogs; toasts communicate mutation results.
- Workspaces/projects use cards and member management; boards use four status columns, dnd-kit drag/keyboard interactions, filters and right-side task/activity dialogs. Open task selection is reflected in the URL query string.
- Existing loading skeletons, empty-state prompts and error alerts must remain consistent in new features.

## 10. Architecture Explorer

Already implemented with React Flow (`@xyflow/react`). `architecture-data.ts` owns component explanations, connections and selectable step-by-step flows; custom nodes/edges and `use-flow-player` implement selection, highlighting and playback. Planned nodes/flows are hidden by default, and a toggle exposes them with planned styling. Integrity tests check that implemented flows use implemented components/connections.

Current flows include authentication, task creation, Kanban movement, cached reads, event distribution and rate limiting. Future examples cover durable notification processing, files and search. Phase 4 adds the Socket.IO component and updates the task/chat flows to the actual domain-bus design, plus a presence flow. Future search, Nginx and monitoring labels now match Phases 7, 8 and 9. Kafka/analytics and Kubernetes Explorer coverage remains pending.

## 11. Completed, incomplete and verification

Phases 1–4 are implemented in source. On 2026-11-05, **105 backend tests (25 unit + 80 integration)**, **38 frontend tests**, and **one cross-container Playwright scenario** passed. Both TypeScript checks passed. Integration tests use real PostgreSQL `syncspace_test`, Redis DB 1 and a private event channel. The browser scenario pinned users to `syncspace-api-1` and `syncspace-api-2`, proved live create/drag and bidirectional chat, checked the normal proxy upgrade, disconnected/reconnected a browser and checked mobile layout. Production builds and both API instances were verified without deleting PostgreSQL volumes.

Pending: durable notifications; email invitation workflow (members can currently be added only as existing accounts); comments/mentions; durable jobs and retries; attachments; global indexed search; health-aware proxying; metrics dashboards; meaningful analytics streaming; Kubernetes/production deployment. The current board title/key filter is client-side filtering, not Elasticsearch search. System Health counters are not Prometheus/Grafana integration.

## 12. Technical debt and risks

| Finding | Practical implication / follow-up |
|---|---|
| SQL commit and event publication are separate | A crash or Redis outage can lose events after a successful write. Use reconciliation for transient UI signals; add a transactional outbox for durable jobs in Phase 5. |
| Shared Redis `allkeys-lru` | Cache data, generations and limiter counters can all be evicted; no guarantee cache keys are evicted first. Assess generation reset/key reuse and limiter weakening under memory pressure. |
| Optional task `version` | UI prevents stale overwrites, but scripts omitting it can overwrite concurrent edits. Preserve compatibility while deciding stronger concurrency requirements. |
| Vite preview/DNS proxy | Suitable current local setup; lacks health-aware balancing, retry policy, production TLS. WebSocket upgrade support is implemented in Phase 4. |
| In-memory diagnostic counters/event buffers/deduplication | Reset on restart and differ by serving replica; not durable observability or business history. |
| Pub/Sub event envelopes are now Zod-validated | Malformed events are ignored; Redis is still trusted private infrastructure. |
| Stateless access-token revocation window | Logout stops refresh but cannot immediately invalidate an issued JWT. Phase 4 closes sockets at expiry, but does not introduce immediate cluster-wide JWT revocation. |
| Scaling multiplies pool capacity | Budget total DB connections across API replicas and future workers. |
| Historical handoff uses eight phases | Current guide/tracker/Explorer labels follow eleven phases; handoff remains a historical record. |
| Delivery/operations gaps | A committed Playwright scenario now exists; CI/ECR and single-host EC2 delivery are verified; durable backup/restore, HA and Kubernetes production orchestration remain pending. PostgreSQL volume persistence is not a backup. |

These are source findings and design limits, not reproduced production incidents. The original documentation assessment did not change application source. Phase 4 subsequently added event validation, authorized socket delivery, reconnect reconciliation and browser verification; remaining risks above are still open.

## 13. Recommended sequence and maintenance

**Phase 4 is implemented and tested; acceptance is pending user review.** It reuses existing SQL transactions, workspace gates, event IDs and query keys. The implementation adds Socket.IO delivery, persisted workspace chat, Redis presence leases and transient notifications. Do not start Phase 5 without the next explicit user approval.

Follow with Phase 5 durable RabbitMQ jobs/outbox; Phase 6 object storage; Phase 7 Elasticsearch; Phase 8 Nginx/scaling; Phase 9 Prometheus/Grafana; Phase 10 justified Kafka analytics; Phase 11 Kubernetes. Each phase requires its own inspect → plan → data flow → implement → test → explain → documentation → regression verify → report cycle, then user approval before proceeding.

Maintain this report for source facts and risks, [SYSTEM_DESIGN_GUIDE.md](SYSTEM_DESIGN_GUIDE.md) for communication/diagrams/trade-offs, and [IMPLEMENTATION_TRACKER.md](IMPLEMENTATION_TRACKER.md) for evidence and approvals. Update affected documents in the same work session as changes. Never mark planned integrations implemented or infer approval from passing tests.


## 14. Phase 4 implementation details

- `infrastructure/realtime/realtime.ts` attaches Socket.IO to the existing server; both handshake and sensitive actions verify JWTs. An expiry timer closes old connections. WebSocket Origin is checked against configured CORS origins.
- Workspace rooms are joined only after a SQL membership check. Each affected event uses one current membership query per workspace per API, evicts unauthorized local sockets, then emits ID-only signals. A 15-second heartbeat also reconciles membership; subsequent HTTP reads remain independently authorized.
- The Phase 3 Redis bus provides the single fan-out path. No Socket.IO Redis adapter is installed because rebroadcasting each already-distributed domain event would duplicate deliveries. Server and browser retain bounded event-ID deduplication.
- Presence uses a Redis sorted-set lease per socket (45 seconds, refreshed every 15 seconds). Multiple tabs count as one user. Disconnect removes its lease; crashes age out. Room subscriptions are capped at 100 per browser connection.
- Socket actions share a Redis budget of 240 requests/user/10 seconds. Connections have a 30/user/minute limit; typing adds a 1/user/2-second limit and is client-throttled. These socket limits fail closed when Redis is unavailable; HTTP remains usable with existing fallback rules.
- Each workspace has one conversation. REST and socket sends share the same service. PostgreSQL uniqueness on workspace/author/clientId makes retries idempotent; reuse with different content is a 409. A new message is committed before its `chat.message` signal is published. History pages use a message-ID cursor resolved to a timestamp/ID tuple within the same workspace.
- RealtimeProvider joins the user's accessible workspaces, refetches after joining/reconnecting, batches invalidations, queues them during a board drag and clears connections on logout. Chat supports older-message pagination, retry-safe sends, typing and online counts. Workspaces, boards and member lists show presence; System Health shows connected sockets.
- Local Redis now binds to **127.0.0.1:16379**, because another service occupied 6379. `.env` host-port/local URL settings were updated without changing credentials. Docker-internal Redis still uses `redis:6379`.
- The original simple PDF is an explicitly dated Phase 3 snapshot; use the current guide/Explorer for live delivery. Cross-container E2E tests create test accounts and remove their workspace; those test accounts remain in the local database.


## 15. Application-wide UI redesign — 2026-11-16

Explicit user authorization covers the complete UI/UX redesign using the installed Taste skill, while preserving application architecture and behavior. This remains Phase 4; no new infrastructure phase is started. See `docs/UI_REDESIGN_PLAN.md` for the route/workflow inventory and design decisions.

- Every route was addressed: login, registration, dashboard, workspaces/detail tabs, projects/board, My Tasks, chat, settings, health and architecture. Existing creation dialogs, task sheet, role controls and destructive confirmations inherit the shared component redesign.
- `components/page-primitives.tsx` supplies reusable real-data collection summaries and empty states; `PageHeader` supplies consistent headings/actions. Dashboard uses the existing personal summary/task/workspace/activity queries for focus lists, a labelled status distribution and shortcuts; it does not invent trends. The existing build roadmap remains accessible in a disclosure, aligned to eleven phases.
- Sidebar reads the existing workspace query cache. The shared Dialog gains a left variant for mobile navigation with focus restoration. AuthProvider, RealtimeProvider, routes, API hooks and backend contracts are unchanged.
- Board pointer targeting now uses pointer containment, with the existing closest-corner fallback for keyboard drags. This corrects a regression exposed by taller redesigned columns while preserving movement, authorization, optimistic updates and conflict rules.
- Collection summaries use a complete three-column grid on phones; dashboard metrics use two columns on phones. The Architecture canvas refits after viewport resize and permits a smaller overview zoom, retaining manual pan/zoom controls. All animations respect reduced motion. Native controls, Radix semantics, keyboard interactions and existing accessible field/button names remain usable. Error, loading and empty states remain implemented; list/table overflow stays within its container.
- `frontend/e2e/ui-workflows.spec.ts` verifies real-service route/form interactions and responsive overflow using isolated verification accounts/workspace. The existing collaboration test still checks two distinct API containers. Current evidence, fixes and limits are recorded separately in the tracker. No dependency manifest, API, SQL migration or database schema changes were made.


## 16. GitHub Actions, ECR and EC2 — 2026-11-20

The user explicitly authorized GitHub Actions, image publication to ECR and EC2 deployment, supplied the repository/instance/local SSH key name, and instructed “continue.” This delivery task is implemented and verified. Product `CURRENT_PHASE` stays 4; it does not complete the broader Phase 11 Kubernetes/production roadmap.

- GitHub: `https://github.com/balumurugan107/SyncSpace`, branch `main`. Existing credential-helper authentication was used; the application was published from the previously untracked local tree into the initial README-only remote. Local `main` now tracks `origin/main`.
- `.github/workflows/ci-ecr.yml`: PR/main/manual backend/frontend tests/builds plus deployment checks. Successful main runs publish API/web `linux/amd64` images into `190706546302.dkr.ecr.ap-south-1.amazonaws.com/syncspace`. Component/commit/run/attempt tags avoid collisions; action versions use pinned SHAs.
- `.github/workflows/deploy-ec2.yml`: automatically follows successful trusted main publication runs with `EC2_DEPLOY_ENABLED=true`; manual dispatch accepts an eligible successful publishing run ID. Source identity/conclusion is validated, outdated automatic queued runs skip, and deployment is serialized.
- `scripts/deploy-ec2-command.py` resolves the two ECR tags to digests and sends release files through SSM. `scripts/deploy-ec2.sh` preserves host secrets, pulls images using the EC2 role, starts/checks stores, runs migrations before replacing services, checks public-proxy readiness and attempts previous-image restoration on unhealthy replacement. SQL is not automatically reversed.
- `deploy/compose.ec2.yml`: separate EC2 stack with one API, web, PostgreSQL 17 and Redis 7.4. Only HTTP port 80 is published. Persistent volume: `syncspace-ec2_postgres-data`; container memory limits and rotating logs suit the 1 GB host. Local Compose and application/API/schema/UI contracts are unchanged.
- Host: `i-07ba7b7856115e939`, `t3.micro`, Amazon Linux 2023, x86_64, public app **http://3.109.56.36**. Initially no profile/Docker/app containers. Attached `SyncSpaceEc2Instance`, restarted the existing SSM agent through authorized local SSH, and installed Docker (CLI 25.0.14, server observed 25.0.18) and checksum-verified Compose 5.8.0. The SSH private key remained local.
- IAM policies under `infra/aws/` separate ECR publishing, instance-scoped SSM deployment/bootstrap, and EC2 SSM/ECR pull. GitHub roles use this repository's immutable OIDC subject with owner/repository IDs and `main` restriction. No long-lived AWS keys were stored in GitHub; no local IAM-user permissions or security-group rules were changed.
- Runtime secrets are generated once on EC2 at `/opt/syncspace/.env` (verified 0600), never transferred from the development `.env`. Both Docker contexts exclude `.env.*` except the example. Current/previous release records remain on the host.
- Verification: **105 backend tests, 38 frontend tests, 5 deployment failure-path tests**, typechecks/builds, both Docker builds, Actionlint, ShellCheck and Compose validation passed. Hosted CI/ECR run `44696518156` and automatic deployment `44696676283` succeeded for commit `639f88c`. Public readiness reports PostgreSQL/Redis up; all four containers are healthy. A real browser/API smoke test passed registration/login, workspace/project/task creation, WebSocket-driven board updates and persisted chat. Its workspace and temporary account were removed.
- Limits: HTTP without TLS/domain, existing Vite preview server, one host/API and brief replacement downtime; no automated backup/restore, HA, load/soak test or live rollback failure drill. Rollback boundaries are tested with fake Docker/AWS. Kubernetes and full production hardening remain future work. See `docs/GITHUB_ACTIONS_ECR.md` and the tracker for operations and evidence.
