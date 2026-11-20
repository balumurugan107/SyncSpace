# SyncSpace

Real-time project collaboration platform (workspaces, Kanban, chat, notifications), built incrementally as a production-style distributed system.

**Current build: Phase 4 (live Kanban updates, workspace chat, presence and transient notifications across API instances).** See [SYSTEM_DESIGN_GUIDE.md](SYSTEM_DESIGN_GUIDE.md) for the architecture, data flow, failure modes and trade-offs, or open **Architecture Explorer** inside the app.

## Quick start

Requirements: Docker with Compose v2, plus Node.js 22+ if you want to run the tests or develop outside Docker.

```bash
./scripts/init-env.sh          # writes .env (or adds new settings to an existing one)
docker compose up --build -d   # postgres + redis -> migrate -> api x2 -> web
```

| URL | What |
|---|---|
| http://localhost:5173 | The app: register, create a workspace, add a project, open its board |
| http://localhost:5173/api/docs | OpenAPI / Swagger UI |
| http://localhost:5173/api/health/ready | Readiness JSON |
| http://localhost:5173/health | System Health: live cluster view, load-balancing demo, event bus |
| `127.0.0.1:4001`–`4004` | API replicas directly. Docker picks a free port in the range per replica; `docker compose ps` shows which (then e.g. `curl -i 127.0.0.1:4002/api/health/ready`) |
| `127.0.0.1:5432` | PostgreSQL (credentials in `.env`) |
| `127.0.0.1:${REDIS_HOST_PORT}` (default 6379; this checkout uses 16379) | Redis (`docker compose exec redis redis-cli`; the password is in `.env`) |

```bash
docker compose ps                 # all services should be healthy; migrate shows "exited (0)"
docker compose logs -f api        # structured JSON logs
docker compose down               # stop (data is kept in the postgres-data volume)
docker compose down -v            # stop and DELETE all data
docker compose up -d --scale api=3   # run three API instances (host ports 4001-4004)
```

### Watch Phase 3 at work

```bash
# Load balancing: each response names the instance that served it
for i in $(seq 6); do curl -s -D - -o /dev/null localhost:5173/api/health/live | grep -i x-served-by; done

# Cache: open a board in the app, then look at the x-cache header in DevTools → Network
# (MISS on the first read, HIT afterwards, MISS again right after any change).

# Resilience: the app keeps working without Redis (readiness reports "degraded")
docker compose stop redis && curl -s localhost:5173/api/health/ready && docker compose start redis
```

## Running the tests

The backend integration tests use a real PostgreSQL database (`syncspace_test`, created automatically by the Postgres container on first start).

```bash
docker compose up -d postgres redis
cd backend  && npm install && npm test          # unit + integration (uses Redis database 1)
cd frontend && npm install && npm test          # component, client and architecture-integrity tests
```

## Local development (hot reload)

```bash
docker compose up -d postgres redis
cd backend  && npm run migrate:dev && npm run dev    # API on :4000, reads ../.env
cd frontend && npm run dev                           # app on :5173, proxies /api to :4000
```

`init-env.sh` writes `DATABASE_URL` and `REDIS_URL` pointing at `localhost` for this; inside Docker the API uses its own URLs from `docker-compose.yml`.

## Try the auth flow from the command line

```bash
curl -c jar -X POST localhost:5173/api/auth/register -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"analytical-1","displayName":"Ada Lovelace"}'
curl -b jar -c jar -X POST localhost:5173/api/auth/refresh   # rotates the refresh cookie
curl -b jar -X POST localhost:5173/api/auth/logout
```

## Trying collaboration with two users

Register two accounts (use a private window for the second). As the first user, create a workspace and add the second user by email on the **Members** tab, then create a project. Both users can now open the board. If both edit the same task, the second save is rejected with a "changed by someone else" message instead of overwriting. Task changes and card moves appear on the other screen without refreshing. Open **Team Chat** in both windows to send messages; online counts combine tabs and API instances. Missed changes are fetched on reconnect. The notification inbox and background email jobs arrive in Phase 5.

## Troubleshooting

- **`Run ./scripts/init-env.sh to update .env`** after pulling Phase 3: your `.env` predates Redis. Run the script; it only appends the missing settings.
- **`429 RATE_LIMITED` while experimenting**: the login limit (20 per 15 min) is shared across instances. Clear it with `docker compose exec redis sh -c 'redis-cli --scan --pattern "rl:*" | xargs -r redis-cli del'`.
- **`Run ./scripts/init-env.sh to create .env`**: Compose needs `.env`. Run the script.
- **Tests fail with `database "syncspace_test" does not exist`**: the Postgres volume was created before the init script existed. Recreate it with `docker compose down -v && docker compose up -d postgres`. This deletes local data.
- **`migrate` exited with code 1**: run `docker compose logs migrate`. An applied migration file was probably edited; add a new migration instead.


## Phase 4 verification

The existing `/api` proxy now carries WebSockets at `/api/socket.io`. Connections use WebSocket-only transport, so the current round-robin proxy needs no sticky sessions. Existing Redis Pub/Sub distributes events once; each API delivers to authorized local sockets. No extra service or Socket.IO Redis adapter is needed. Chat history is stored by the additive `003_workspace_chat.sql` migration.

```bash
cd backend && npm test && npm run typecheck && npm run build
cd ../frontend && npm test && npm run typecheck && npm run build
```

The committed Playwright scenario requires the running Compose app and **two distinct API URLs**. It creates verification accounts, removes its workspace afterward and leaves those accounts in the local database. It checks live create/drag, both-direction chat, offline recovery, proxy upgrades, mobile overflow and Explorer availability.

```bash
# Find API replica ports; use the Docker context configured for your machine.
docker compose port --index 1 api 4000
docker compose port --index 2 api 4000

cd frontend
# Use the two URLs reported above (example values below may differ).
E2E_API_A=http://127.0.0.1:4004 E2E_API_B=http://127.0.0.1:4003 \
  BROWSER_PATH=/usr/bin/google-chrome npm run test:e2e
```

`BROWSER_PATH` is optional if Playwright Chromium is installed (`npx playwright install chromium`). Missing replica variables explicitly skip this cross-instance test, rather than pretending one server proves scaling. Screenshots are written to ignored `frontend/test-results/`; traces are disabled to avoid recording authenticated sessions.

If Redis's host port is occupied, set a free `REDIS_HOST_PORT` and update the localhost `REDIS_URL` in `.env`. This checkout uses **16379**; Docker-internal connections still use `redis:6379`. Live delivery can pause during Redis outages, while existing HTTP task and chat operations continue. The current notification toasts are transient; durable inbox/email/outbox work belongs to Phase 5.
