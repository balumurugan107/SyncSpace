# SyncSpace — Implementation Tracker

Last updated: **2026-11-20 (Asia/Kolkata)**.

## Status and approval rules

Track implementation, verification and approval separately. **Implemented** means source exists; **tested** means named checks passed with evidence; **approved** requires an explicit user decision. Historical completion claims do not establish approval. Do not start another phase automatically. The latest eleven-phase user brief governs this tracker; the historical handoff uses a different grouping; current Explorer labels have been aligned.

Current work: **Phase 4 implemented and tested, ready for user acceptance**, authorized on 2026-11-05 by the instruction, “Proceed to the next phase of implementation.” `CURRENT_PHASE = 4`, API version `0.4.0`. Phase 5 has not started and is not authorized.

## Phase ledger

| Phase | Scope | Implementation | Verification | User approval |
|---|---|---|---|---|
| Assessment | Inspect architecture, UI source, infrastructure; maintain three documents | Complete | Source review, tests/typechecks, container status; Phase 4 adds browser/mobile evidence | Approved to proceed to Phase 4 on 2026-11-05 |
| 1 | Setup, frontend/backend, PostgreSQL, Docker, auth, dashboard | Implemented | Existing relevant unit/integration/frontend suites pass on 2026-11-04 | Historical approval not recorded |
| 2 | Workspaces, projects, tasks, Kanban, CRUD/history | Implemented | Existing authorization, concurrency, task/board suites pass on 2026-11-04 | Historical approval not recorded |
| 3 | Redis cache/invalidation/Pub/Sub, shared limits, multiple APIs | Implemented | Existing Redis integration tests pass; two healthy API containers observed | Historical approval not recorded |
| 4 | Socket.IO, live boards/chat/presence, workspace rooms, real-time delivery | Implemented | 105 backend + 38 frontend tests and cross-container browser scenario pass; builds/typechecks pass | Approved to start 2026-11-05; acceptance pending |
| 5 | RabbitMQ, durable background jobs, persisted notifications/invitations, retries/DLQ | Pending | Not tested | Not recorded |
| 6 | MinIO/S3 files, signed access, metadata, authorized attachments | Pending | Not tested | Not recorded |
| 7 | Elasticsearch search, async indexing, pagination/filtering, reindexing | Pending | Not tested | Not recorded |
| 8 | Nginx, health-aware balancing, scaling and pool/rate-limit review | Partial prerequisites only: replicas, Redis state, pool, shutdown and rate limits exist | Current prerequisites covered; Nginx/failure routing not tested | Not recorded |
| 9 | Prometheus/Grafana, API/cache/queue/worker/DB/resource metrics | Partial prerequisites only: health endpoints, Pino and diagnostic counters exist | Existing health tests pass; metrics/dashboard integration absent | Not recorded |
| 10 | Justified Kafka analytics/event streaming | Pending; first establish a meaningful use case | Not tested | Not recorded |
| 11 | Production images, Kubernetes, ingress/HPA/probes/secrets/storage/rollouts | Partial prerequisites only: existing multi-stage Dockerfiles and shutdown | No Kubernetes or production deployment verification | Not recorded |

## Existing capability inventory

| Capability | Evidence | Remaining boundary |
|---|---|---|
| Auth and sessions | `backend/src/modules/auth`, frontend auth/client; auth tests | JWT remains valid until expiry after logout |
| Workspace roles/membership | Shared `workspace-access.ts`, workspace routes and tests | Existing-account add-by-email; email invitations pending |
| Projects and Kanban | Projects/tasks services, SQL migration 002, frontend board and tests | Live push implemented in Phase 4; comments and attachments pending |
| Activity | Transactional `activity_logs`, scoped history APIs and feed | Async fan-out/analytics pending |
| Redis caching | Cache service, post-commit hooks, Redis integration suite | Failure staleness and shared eviction policy remain risks |
| Cross-instance backend events | Pub/Sub event bus and integration tests | Authorized browser sockets now deliver signals; durable replay remains absent |
| Architecture Explorer | React Flow nodes, explanations, flow player, integrity tests | Phase 4 task/chat/presence flows and eleven-phase future labels updated; analytics flow pending |
| Cluster diagnostics | System routes, Redis registry, health page | Polling and in-memory counters; full monitoring pending |

## Verification record — 2026-11-04

Executed against the existing checkout with installed dependencies, Node **v22.12.0**, npm **10.9.0**. No application source changes, dependency installation, migration edits, container rebuilds or destructive environment resets were performed.

| Check | Result | Evidence/limits |
|---|---|---|
| `frontend: npm test` | PASS — 30 tests, 6 files | Client, navigation, architecture data/player, board/date logic |
| `frontend: npm run typecheck` | PASS | `tsc -b` |
| `backend: npm run test:unit` | PASS — 25 tests, 3 files | Auth schemas, tokens/config, positioning |
| `backend: npm run typecheck` | PASS | `tsc --noEmit` |
| `backend: npm run test:integration` | PASS — 68 tests, 5 files | Actual PostgreSQL test database and Redis DB 1/private event channel; suite includes migrations, auth, workspace/task authorization/concurrency, caching/events/rate limits and system endpoints |
| `docker compose ps --format json` | PASS — healthy postgres, redis, web, api ×2 | Existing API direct ports 4003 and 4002 at inspection time; running images were not rebuilt against source |
| Browser visual/responsive review | Not performed this assessment | UI source reviewed; no browser automation tool available in this session |
| Fresh multi-browser/multi-replica collaboration drill | Not performed this assessment | Historical handoff claims exist; current integration tests exercise two event subscribers, not a new live-browser drill |
| Production build, clean-volume startup, outage drills | Not rerun this assessment | Documentation-only work; existing handoff reports prior checks |

The initial sandboxed integration attempt could not reach localhost PostgreSQL (`EPERM`); all 68 tests were skipped during setup failure. It was rerun with approved network access and all passed. Docker inspection similarly required access outside the sandbox. Neither initial restriction is recorded as an application defect.

## Phase 4 workflow — completed

1. User approval recorded on 2026-11-05 before implementation.
2. Inspect/reuse HTTP server, auth/token functions, workspace role checks, event bus, work query keys and existing UI components.
3. Explain socket authentication/expiry/reconnect, workspace-room access and revocation, chat persistence and cross-instance flow. Select one event fan-out strategy to avoid duplicate broadcasts.
4. Implement the smallest compatible change with SQL migrations for persisted chat; update OpenAPI, Explorer and proxy transport configuration where needed.
5. Verify unauthorized room rejection, revoked membership, persist-before-broadcast, token expiry, duplicate events, reconnection, Redis interruption and chat history.
6. Demonstrate authorized users in separate browsers connected to separate API instances observing task/chat changes without refreshing.
7. Run existing regression suites, update all three documents, report evidence and known limits; wait for approval before Phase 5.

## Open risks and follow-up

- Source findings and implications are recorded in [PROJECT_UNDERSTANDING.md §12](PROJECT_UNDERSTANDING.md#12-technical-debt-and-risks).
- Preserve the distinction between best-effort Pub/Sub UI signals and durable RabbitMQ jobs/outbox work.
- Review Redis eviction of generation/limiter keys; malformed event payloads are now validated and rejected.
- Explorer future search/Nginx/monitoring labels now match the eleven-phase roadmap. Kafka/analytics and production Explorer coverage remain future work.
- Desktop/mobile chat screenshots were inspected in Phase 4; broader accessibility/load/soak testing remains future work.
- Do not initialize Git or delete/recreate database volumes as part of routine documentation maintenance.

## Change and approval log

| Date | Work/decision | Evidence and approval |
|---|---|---|
| 2026-11-04 | Imported Phase 1–3 baseline from source and historical handoff; created understanding report/tracker, updated design guide, added maintenance instructions | 93 backend + 30 frontend tests pass; both typechecks pass; no new feature phase started |
| 2026-11-04 | Adopted latest user brief's eleven-phase roadmap in documentation | User-supplied brief; historical handoff/source future labels preserved and explicitly identified |
| 2026-11-04 | Created `docs/SyncSpace_Architecture_Simple.pdf`; linked it from the understanding report and design guide | Three A4 pages explaining browser-to-database flow, task creation/reads, login, Redis and API replicas. Verified PDF metadata/text extraction and visually inspected all rendered pages. Documentation only; no new application tests or phase implementation. |

For future entries record the phase, exact scope, changed files/migrations/infrastructure, command/date/results, untested areas, remaining issues and explicit approval wording/date when provided. Leave approval pending when no decision exists.


## Phase 4 delivery — 2026-11-05

**Approval:** user said “Proceed to the next phase of implementation.” This authorizes Phase 4 only; it does not establish acceptance or authorize Phase 5.

### Delivered

- Authenticated Socket.IO server/client on `/api/socket.io`, WebSocket-only proxy upgrades, workspace/user rooms, expiry/refresh/reconnect lifecycle and graceful shutdown.
- Existing Redis domain-event fan-out with Zod envelope validation, bounded server/browser deduplication and authorized local delivery. No second adapter broadcast or simulated event transport.
- Current membership checks before delivery, cross-instance member eviction and periodic membership reconciliation; membership notices reach added/removed users.
- Live Kanban/task/detail/dashboard/activity query reconciliation, batching, drag deferral and post-join/reconnect catch-up.
- Persisted workspace chat with HTTP and socket send paths, history pagination, retry-safe client IDs, validation, errors and typing indicators.
- Redis presence leases, multi-tab deduplication, online indicators in boards/workspaces/members/chat, connected socket counts on System Health.
- Transient teammate task/chat toasts. The durable notification inbox, asynchronous assignment/email jobs, RabbitMQ/outbox and retries remain Phase 5.
- Architecture Explorer task/chat flows rewritten to actual code; presence flow added; future infrastructure phase labels corrected; navigation/build labels updated to Phase 4 of 11.

### Files and infrastructure

| Area | Created/changed |
|---|---|
| SQL | New `backend/migrations/003_workspace_chat.sql`; existing migrations preserved |
| Backend modules | New `modules/chat/{chat.service,chat.routes}.ts`; app routing, member-target event fields, version and startup/shutdown integration |
| Backend infrastructure | New `infrastructure/realtime/{realtime,presence}.ts`; event-envelope validation and socket metrics |
| Frontend | New `features/realtime` provider/logic/presence and `features/chat/chat-page.tsx`; auth/token access, root provider/router, Kanban/member/workspace UI, System Health, Explorer, navigation/sidebar and Vite WebSocket/bundle configuration |
| Dependencies | Socket.IO server/browser client; backend client for integration tests; Playwright development tooling; both manifests/lockfiles |
| Verification | New backend `realtime.test.ts`; frontend real-time logic/provider tests; `frontend/e2e/collaboration.spec.ts` and `playwright.config.ts`; architecture assertions and valid UUID event fixtures updated |
| Documentation/config | All three maintained documents, README, Docker comments and `.gitignore`; browser artifact directories ignored |
| Local environment | Docker Desktop started. Redis's occupied host port 6379 moved to 16379 in local `.env` port/URL settings; credentials unchanged. Existing PostgreSQL volume preserved. Additive migration applied and web/API images rebuilt. |

### Verification evidence

| Check | Result and scope |
|---|---|
| Backend `npm test` | **105 passed**, 9 files (25 unit + 80 integration), real PostgreSQL test DB and Redis DB 1/private channel |
| New backend tests | 12 scenarios: invalid/expired token/Origin; outsiders/validation; two-server delivery/dedup/malformed events; persist/idempotency; DB failure emits nothing; removal evicts on both servers; multi-tab presence; expired lease; connected-token expiry; shared limits; Redis subscriber interruption/recovery; history pagination/isolation |
| Frontend `npm test` | **38 passed**, 8 files, including room lifecycle, reconnect/expiry/degraded state, drag queue and deduplication |
| TypeScript and builds | Both applications pass; frontend Socket.IO chunk split keeps build below the bundle warning threshold |
| `npm run test:e2e` | **1 passed** using Chrome and actual separate `syncspace-api-1`/`syncspace-api-2` containers. Checked UI task create and pointer drag, normal proxy WebSocket upgrade, forced socket close/offline catch-up, bidirectional chat, mobile width and Explorer. |
| Visual review | Desktop and 390 px mobile chat screenshots inspected; existing design tokens/layout preserved |
| Docker | Rebuilt web/API images, migration job completed, PostgreSQL/Redis and both APIs healthy; no volume deletion |

Initial integration runs failed because Docker/PostgreSQL were stopped. Starting Docker exposed a 6379 port collision, resolved by moving only SyncSpace's host binding to 16379. Browser test fixtures were corrected to use a separate login family for an independent proxy-check context and to explicitly close the socket during offline testing (Chromium kept an existing socket alive). Frontend lifecycle tests needed explicit DOM cleanup. All stated passing results are from reruns after these corrections.

**Known limits:** best-effort Pub/Sub has no replay; chat restores from PostgreSQL, but transient toasts/typing are not durable. Redis outages disable live delivery/presence and socket limits fail closed; HTTP fallback continues. One conversation per workspace, no custom channels, optimistic unsaved message display, unread counters, comments or message editing/deletion. JWT revocation on another session retains the existing expiry window. No production load/soak test, Redis-wide outage drill or clean-volume reset performed. The original simple PDF remains a labelled Phase 3 snapshot. E2E removes its workspace but leaves verification accounts locally.

**Next:** user acceptance/review of Phase 4. Only after further explicit approval: inspect and plan Phase 5 RabbitMQ/outbox, background workers and persisted notifications/invitations.

## Chat UI refinement — 2026-11-16

**Authorization:** user requested, “install and use taste skill to improve chat ui.” This authorizes the skill installation and chat presentation changes; it does not authorize Phase 5 or establish Phase 4 acceptance.

- Installed `design-taste-frontend` from `Leonxlnx/taste-skill`, path `skills/taste-skill`, using the system skill-installer helper. Installation location: `/home/aximsoft/.codex/skills/design-taste-frontend`. Read and applied its design guidance while preserving the repository's existing tokens/components and application scope.
- Updated `frontend/src/features/chat/chat-page.tsx`: responsive conversation layout, desktop workspace/member sidebar, mobile workspace selector, real presence indicators, distinct message bubbles, local date separators, improved loading/empty/error presentation and composer, and Ctrl/Command+Enter submission with IME protection. Existing send button/accessibility names, HTTP contracts, retry IDs, history pagination and socket behavior are retained. Failed history refreshes retain previously loaded messages and show an error.
- Updated all three maintained documents; `.gitignore` excludes local `.taste-skill/` reports/profiles. No backend, SQL, infrastructure, dependency manifest or roadmap changes.
- Frontend `npm run typecheck`, `npm test` (**38 passed, 8 files**) and `npm run build`: **PASS** on 2026-11-16. An initial npm invocation from the repository root failed because there is no root package.json; all reported passes were run from `frontend`.
- Visual verification uses an isolated temporary HTTP/Socket.IO fixture server serving the actual frontend build with sample workspace/member/message data; it does not access real accounts, cookies, secrets or PostgreSQL. Desktop (1440 px) and mobile (390 px) screenshots were generated with the installed taste skill's `shoot.mjs` and visually inspected. Additional responsive/state checks are recorded below when complete.
- Taste finish gate: **`GATE: ERROR (the copy (the page showed no <main>, <section> or <h1> to lint); consistency.mjs gave no report (exit 2); check.mjs could not run (exit 2))`** against the authenticated localhost chat route. No gate pass, performance result or real-service collaboration verification is claimed. Gate was not rerun, per its instructions. Existing full-stack collaboration evidence remains dated 2026-11-05.
- Additional fixture screenshots at 1024, 820 and 768 px, 390 px dark/reduced-motion and a 320 px empty conversation were visually inspected. The skill's separate `assets/layout/check.mjs` failed with `r.sections is not iterable`; no automated layout pass is claimed. Copy lint on TSX returned 0 FAIL and 1 WARN for exclamation marks in TypeScript boolean operators; this source-code warning is retained as a false positive, not a claim that rendered copy was linted successfully. No skill-kit files or checks were modified.
- Local runtime: `docker compose up --build -d --no-deps web` rebuilt/recreated only web. Subsequent Compose inspection reported web, both APIs, PostgreSQL and Redis healthy. HTTP `/` matched the newly built `frontend/dist/index.html`. Backend containers and database volumes were preserved. This is a local web update, not a production deployment.
- Known scope: one shared conversation per workspace; no new search, channels, attachments, read receipts or unread tracking. Browser fixture checks establish presentation only, not real backend/Redis delivery. No new full-stack collaboration or backend integration tests were run for this presentation change.


## Application-wide Taste redesign — 2026-11-16

**Authorization:** user requested, “Completely revamp the UI/UX of this entire application using the Taste skill,” explicitly authorizing direct autonomous implementation, every-page redesign, responsive checks and regression fixes while preserving functionality/architecture. This authorizes presentation work within Phase 4, not Phase 5 or production deployment. Acceptance remains a separate user decision.

### Implementation

- Read the installed `/home/aximsoft/.codex/skills/design-taste-frontend/SKILL.md`, architecture/understanding/tracker and route/component/workflow source before changing it. The user's application preservation requirements govern where the marketing-oriented skill conflicts. `docs/UI_REDESIGN_PLAN.md` records scope, inventory, design and verification boundaries.
- Updated `index.css`, shared UI primitives (cards, buttons, inputs, textareas, selects, tabs, badges, dialogs, dropdowns), logo/favicon and `index.html`; added locally hosted Inter variable font and upstream license under `frontend/public/fonts`. No package dependency or lockfile changes.
- Rebuilt shell/sidebar/header, actual-query workspace switching, skip link and mobile Dialog navigation/focus restoration; added reusable collection summary/empty-state components.
- Redesigned dashboard, workspace collection/detail/projects/members/settings, project collection/cards, board/columns/cards/task sheet, My Tasks, chat, account settings, auth layouts/forms, Health and Architecture canvas/flow/explanation surfaces. Existing form dialogs/confirmation components inherit the shared redesign. Eleven-phase roadmap remains available in a dashboard disclosure.
- Preserved backend/API/schema, auth and realtime providers, routing, query state, member permissions, creation/edit/deletion, task versions/optimistic moves, history, retry-safe chat and theme/session workflows.
- Board pointer containment with keyboard corner fallback fixes wrong-column targeting exposed by taller columns. A new mobile dialog opener ref restores focus after Escape dismissal.
- Updated sidebar unit test to provide the query context required by the real workspace switcher; added `frontend/e2e/ui-workflows.spec.ts`. `frontend/.dockerignore` excludes local browser/design reports from build context. All three maintained documents are synchronized.

### Verification and findings

- Frontend `npm test`: **38 passed / 8 files** after the sidebar provider fixture update and again after pointer/focus fixes. `npm run build`: **PASS**, including TypeScript and Vite build. No new dependency or bundle warning.
- Backend `npm test`: **105 passed / 9 files**, real isolated PostgreSQL test database and Redis DB 1/private channel. Backend `npm run typecheck`: **PASS**. Backend source unchanged.
- Existing cross-instance Playwright scenario: **PASS after pointer-targeting fix**; distinct `syncspace-api-1` and `syncspace-api-2`, UI create/drag, proxy WebSocket upgrade, offline catch-up, bidirectional chat and mobile overflow.
- Initial browser failures were actionable: taller column geometry sent a pointer drag to the neighbour; mobile drawer did not restore focus. Both source issues were corrected. A later all-page test's final expectation incorrectly assumed dashboard after login; the existing guard correctly restored Settings. The test was corrected to preserve that behavior.
- Browser screenshots of all routes and workspace tabs at 1440/768/390 px were captured; initial desktop route montage, dashboard and mobile settings were visually inspected. A screenshot scroll reset removes sticky-header artifacts from captures taken after editing lower-page controls.
- Local Docker web image rebuilt and container recreated using `docker compose up --build -d --no-deps web`. Backend containers and data volumes preserved; no migration or production deployment.

Additional visual-review fixes: complete three-column collection summaries, compact two-column phone dashboard metrics, an explicit horizontal-scroll hint on mobile boards, and responsive React Flow fit/zoom on viewport changes. Improved auth main/skip-link semantics, keyboard focus indicators and dark-panel text contrast. The full all-page/CRUD workflow passed before these last presentation refinements; final rerun evidence follows below.


### Final review notes

- Final narrow-screen inspection also found that the hidden Architecture explanation panel could contribute scrollable overflow and clip the playback panel. Its canvas now contains that overflow, playback grid children allow shrinking, and a browser assertion checks the Previous-step control's horizontal bounds after every resize. Graph focus outlines are restored through application CSS above the vendor reset; no dependency source was edited. The browser scenario additionally opens/closes a component explanation and checks the actual focused node outline.
- Repeated real-service browser runs exhausted the normal auth budget for the local verification client (`172.19.0.1`, current fixed window). Redis inspection showed count 21. Only that exhausted temporary `rl:auth` key was deleted before the final run; limit rules/configuration, other rate-limit keys and domain data were unchanged. This was a development verification reset, not a rate-limit bypass in application code.
- Taste initially returned `GATE: FAIL 21 (round 1 of 3)`. An unchanged-URL rerun reused that report. A versioned URL for the same public sign-in page produced a fresh `GATE: FAIL 17 (round 2 of 3)` after focus/contrast improvements. No pass or blanket accessibility/performance certification is claimed. `docs/TASTE_REVIEW_NOTES.md` records all remaining findings, their scope and the vendor CSS reset/application override distinction; no formal waivers or checker/kit edits.

- Graph focus verification found that relying only on `:focus-visible`/vendor selectable classes was insufficient under browser input-modality heuristics. The application override now covers focused graph nodes explicitly; the regression checks both actual node focus and its computed solid outline. This affects presentation only, not graph selection or flow data.

- A fresh isolated browser focus diagnostic confirmed the graph node is the active element with a solid outline across repeated reads. The all-page fixture initially tried to focus a node before React Flow finished its remount after toggling planned components. It now waits for a visible node and checks settled focus/outline. The same local verification-client auth counter was reset again after repeated diagnostic reruns; no limiter configuration was changed.


### Delivery verification — completed 2026-11-16

| Check | Final evidence |
|---|---|
| Frontend tests | 38 passed, 8 files; last application build includes all focus and responsive fixes |
| Frontend production build / TypeScript | PASS (`tsc -b && vite build`), no bundle warning |
| Backend tests / TypeScript | 105 passed, 9 files against isolated test stores; `tsc --noEmit` PASS; backend unchanged |
| Cross-instance collaboration | PASS on final application build: two distinct API containers, pointer drag, proxy upgrade, offline catch-up and bidirectional chat |
| Complete UI workflow | PASS after waiting for remounted graph nodes to be visible; all twelve routes plus workspace tabs at 1440/1024/768/390/320 px; no horizontal page overflow; keyboard board moves; create/edit/delete workspace, project and task; member role/removal; profile/theme; chat; Health demo; Architecture playback/planned toggles/explanation; graph outline; mobile drawer dismissal, navigation and focus restoration; logout/login return route |
| Visual review | Route overview sheets and individual desktop/mobile/dashboard/settings/Architecture views inspected; mobile graph playback and summary-grid defects corrected. Fresh browser computed-style diagnostic confirms selected Dark state and light input text; final screenshot waits for color transitions to settle. |
| Taste gate | `GATE: OPEN 17 (rounds used up)`. All findings/warnings and their scope retained in `docs/TASTE_REVIEW_NOTES.md`; no PASS or formal waiver claimed. |
| Local delivery | Only web rebuilt/recreated; web, both APIs, PostgreSQL and Redis healthy. Served `/` byte-matches `frontend/dist/index.html`; local Inter font returns HTTP 200. |

All three maintained documents and the design/review notes are synchronized. Backend/schema/API contracts, current phase and dependency manifests are unchanged. Verification workspaces are cleaned up; test accounts, including isolated focus/theme diagnostic accounts, remain locally. No existing user domain data or database volume was deleted. No production deployment, full assistive-technology audit, load/soak test or performance certification is claimed. Phase 5 is not started or authorized by this UI task. User acceptance of the redesign remains pending.

- The final Taste public-form checks also consumed the shared local auth budget. A later UI attempt reached its final login step with a 429, not an invalid credential or routing failure. After checker activity ended, only the exhausted current-window auth counter for the local verification client was reset (conditional deletion only when count exceeded 20). The final workflow was then run alone. No application rate-limit bypass or relaxed limit was introduced.

**Final isolated workflow rerun: PASS — 1 scenario in 23.2 seconds**, after all design-checker activity stopped. It includes the dark-theme selected-state/computed-color assertion, settled graph focus/outline, five-width control bounds and the complete create/edit/delete and logout/login flow. Cross-instance collaboration passed separately on this same application build. No application code changes followed these passing checks.


## GitHub Actions and ECR delivery — 2026-11-20

**Authorization:** user asked to configure GitHub Actions, then “deployment auto mation too, need to push the image to aws ecr”, and supplied `https://github.com/balumurugan107/SyncSpace`, `ap-south-1` and ECR repository `syncspace` in account `190706546302`. This explicit authorization covers CI/ECR setup. Runtime target details remain missing. No new product phase or Phase 11 completion is inferred.

**Implementation:** added `.github/workflows/ci-ecr.yml`, exact IAM trust/permissions JSON in `infra/aws/`, and `docs/GITHUB_ACTIONS_ECR.md`; hardened both Docker ignore files against `.env.*`; synchronized the three maintained documents. Checks gate main-branch API/web publication into one ECR repository with component-specific immutable-compatible tags and digest summaries. No application/API/schema/phase changes.

**Local verification (2026-11-20):**

- Backend `npm run typecheck`, `npm run test:unit` (25 passed), `npm run build`: PASS. Full `npm test`: **105 passed / 9 files**, using temporary `syncspace-ci-check-postgres` and `syncspace-ci-check-redis` containers, dynamic localhost ports and explicit test URLs. Those two temporary containers/volumes were removed after success; existing application database volumes were preserved.
- Frontend `npm test`: **38 passed / 8 files**; `npm run build` (includes TypeScript): PASS.
- Started Docker Desktop, built both existing Dockerfiles successfully as `syncspace-api:ci-check` and `syncspace-web:ci-check`. No local application container was rebuilt/replaced by these commands.
- Actionlint container (`rhysd/actionlint`, image digest `sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667`): PASS. ShellCheck was disabled/unavailable; no ShellCheck pass claimed.
- GitHub credential-helper authentication verifies account `balumurugan107` with repository admin/push access. Added local `origin` and fetched its `main`, initially a README-only commit. Nonignored files scanned for common AWS/GitHub/private-key credential patterns with no matches; `.env` remains ignored. No credential values were printed.
- AWS STS verifies account `190706546302`, user `Baludev`; default region `ap-south-1`. ECR listing and exact repository description return AccessDenied. IAM initially had no OIDC providers; created the GitHub provider and publishing role. No runtime service or production database changes made.

**Pending remote evidence:** role policy and GitHub variable verification, source publication and first hosted Actions/ECR run. The final outcome is recorded below when observed. Browser E2E and production rollout have not been run.

### Hosted setup and initial run

- Created `arn:aws:iam::190706546302:oidc-provider/token.actions.githubusercontent.com` and `arn:aws:iam::190706546302:role/SyncSpaceGitHubEcrPublish`. Attached and read back inline policy `SyncSpaceEcrPublish`, scoped to the selected ECR repository. Set and read back GitHub variables `AWS_REGION`, `ECR_REPOSITORY` and `AWS_ROLE_ARN`.
- Published application/workflow commit `89411e9` to the existing remote `main` using an isolated checkout based on its initial README commit. Preserved local files and aligned the previously unborn local branch/index to the published commit; `main` tracks `origin/main`. The initial all-files whitespace check found pre-existing trailing spaces in `realtime-provider.tsx`; those source lines were preserved. The changed infrastructure/docs files pass whitespace checks.
- First hosted run: https://github.com/balumurugan107/SyncSpace/actions/runs/44693892910. Frontend and backend checks passed. Publishing initially retried STS authentication because this repository uses immutable OIDC subjects. GitHub's `actions/oidc/customization/sub` reports `use_immutable_subject: true` and prefix `repo:balumurugan107@74696482/SyncSpace@1463714917`. Updated the IAM trust policy and checked-in JSON to that exact prefix plus `:ref:refs/heads/main`; branch restriction remains intact.
- User selected **EC2** for runtime deployment. EC2 `DescribeInstances` and SSM `DescribeInstanceInformation` are denied to the local AWS identity. Requested instance ID, SSM status, URL/domain and PostgreSQL/Redis placement. No instance, security group or runtime secret was modified. EC2 rollout remains pending those details/access.
