import { CURRENT_PHASE } from '@/components/layout/navigation';

/**
 * Single source of truth for the Architecture Explorer.
 *
 * Every component, connection and flow carries the build phase in which it ships.
 * Status is DERIVED from CURRENT_PHASE, never hand-written, so the diagram cannot
 * claim something is implemented before it is. A unit test enforces that
 * implemented flows only travel over implemented connections.
 */

export type IconName =
  | 'browser'
  | 'web'
  | 'api'
  | 'postgres'
  | 'migrate'
  | 'redis'
  | 'socket'
  | 'rabbitmq'
  | 'workers'
  | 'minio'
  | 'elasticsearch'
  | 'nginx'
  | 'prometheus'
  | 'grafana';

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface ArchComponent {
  id: string;
  name: string;
  kind: string;
  icon: IconName;
  phase: number;
  position: { x: number; y: number };
  tagline: string;
  what: string;
  why: string;
  features: string[];
  receives: string[];
  sends: string[];
  example: { caption: string; language: 'sql' | 'ts' | 'bash' | 'text'; code: string };
  failure: string;
  alternatives: { name: string; tradeoff: string }[];
  /** Horizontally scaled: drawn as a stack once `phase` ships. */
  replicas?: { count: number; phase: number };
}

export interface ArchConnection {
  id: string;
  source: string;
  target: string;
  sourceSide: Side;
  targetSide: Side;
  label: string;
  phase: number;
}

export interface FlowStep {
  title: string;
  detail: string;
  /** Components involved in this step (highlighted). */
  nodes: string[];
  /** Connections the request/event travels over; `reverse` animates target -> source (responses). */
  edges: { id: string; reverse?: boolean }[];
}

export interface ArchFlow {
  id: string;
  name: string;
  phase: number;
  summary: string;
  steps: FlowStep[];
}

export const isImplemented = (item: { phase: number }): boolean => item.phase <= CURRENT_PHASE;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export const COMPONENTS: ArchComponent[] = [
  {
    id: 'browser',
    name: 'Browser client',
    kind: 'Client',
    icon: 'browser',
    phase: 1,
    position: { x: 0, y: 240 },
    tagline: 'React single-page app running on each user’s machine',
    what: 'The SyncSpace user interface: a React + TypeScript single-page application. After the first load it never reloads the page; it talks to the backend with JSON requests and re-renders what changed.',
    why: 'A single-page app gives an instant, desktop-like feel, which matters for a collaboration tool where boards and chat update constantly. React Query caches server data in the browser so screens open immediately and refresh in the background.',
    features: ['Sign-in and registration', 'Dashboard and My Tasks', 'Workspaces, members and projects', 'Kanban board with drag-and-drop (optimistic updates)', 'Settings, Architecture Explorer and System Health'],
    receives: [
      'The compiled HTML/JS/CSS bundle (once per visit)',
      'JSON responses from the REST API',
      'A short-lived access token (kept only in memory)',
      'An httpOnly refresh cookie (stored by the browser, unreadable by JavaScript)',
    ],
    sends: ['REST requests with an `Authorization: Bearer <jwt>` header', 'The refresh cookie, automatically, to /api/auth/* only'],
    example: {
      caption: 'Every API call goes through one wrapper that attaches the token and transparently refreshes it once when it expires.',
      language: 'ts',
      code: `const { user } = await api.get<{ user: User }>('/users/me');
// 401 TOKEN_EXPIRED -> POST /api/auth/refresh -> retry once`,
    },
    failure: 'Closing the tab loses the in-memory access token, which is intended. On the next visit the browser still holds the refresh cookie, so the session is silently restored. If the network drops, requests fail with a visible error and React Query retries reads.',
    alternatives: [
      { name: 'Server-side rendering (e.g. Next.js)', tradeoff: 'Faster first paint and better SEO, but SyncSpace sits behind a login, so SEO does not matter and a SPA keeps the frontend and API cleanly separated.' },
      { name: 'Token in localStorage', tradeoff: 'Simpler, but any XSS bug could steal a long-lived credential. Memory + httpOnly cookie limits what an attacker can take.' },
    ],
  },
  {
    id: 'web',
    name: 'Web server & API proxy',
    kind: 'Edge',
    icon: 'web',
    phase: 1,
    position: { x: 300, y: 240 },
    tagline: 'Serves the React bundle and load-balances /api/* across API instances',
    what: 'The `web` container. It serves the production build of the React app and proxies every request under /api to the API. Since Phase 3 it also load-balances: Docker’s DNS answers the name `api` with the IP of every replica, and the proxy rotates new connections through that list (DNS round-robin, keep-alive off).',
    why: 'Because the UI and the API share one origin (localhost:5173), the refresh cookie is first-party and can use SameSite=Strict, and the browser never needs CORS pre-flight requests. In Phase 8, Nginx takes over this role and also load-balances several API instances.',
    features: ['Delivering the app to the browser', 'Same-origin access to the API'],
    receives: ['HTTP requests from browsers'],
    sends: ['Static files (HTML, JS, CSS)', 'Each /api request to the next API replica in turn, with X-Forwarded-For carrying the real client IP'],
    example: {
      caption: 'frontend/vite.config.ts: round-robin over every replica Docker’s DNS returns',
      language: 'ts',
      code: `dns.resolve4('api')        // -> ['172.19.0.3', '172.19.0.5']
const address = sorted[next++ % sorted.length];
agent: new http.Agent({ keepAlive: false, lookup: roundRobinLookup })`,
    },
    failure: 'Users cannot load the app or reach the API through it. Data is unaffected. Docker restarts the container automatically (restart: unless-stopped).',
    alternatives: [
      { name: 'Nginx (Phase 8)', tradeoff: 'Health checks (a failing replica is skipped), least-connections balancing, TLS and compression. DNS round-robin has none of these: a crashed replica keeps receiving its share until Docker removes it from DNS.' },
      { name: 'Separate origins + CORS', tradeoff: 'Lets the UI live on a CDN domain, but cookies become cross-site and need SameSite=None, which weakens CSRF protection.' },
    ],
  },
  {
    id: 'api',
    name: 'Node.js API',
    kind: 'Application · 2 replicas',
    icon: 'api',
    phase: 1,
    position: { x: 600, y: 240 },
    tagline: 'Stateless Express 5 modular monolith, running as several instances',
    what: 'The backend: one Node.js process built from independent modules: auth, users and health (Phase 1); workspaces, projects, tasks, activity and me (Phase 2). Each module owns its routes, validation, business logic and SQL. One function, requireWorkspaceRole, decides who may touch what. Since Phase 3 it runs as 2 identical replicas (docker compose --scale api=N); each answers with an x-served-by header.',
    why: 'A modular monolith gives one thing to build, deploy and debug while the product takes shape. Instances are STATELESS: tokens are verified by signature, sessions and data live in PostgreSQL, shared state lives in Redis. Any instance can serve any request, so scaling out is just running more copies.',
    features: ['Registration, login, session rotation', 'Workspaces with owner/admin/member roles', 'Projects and task CRUD', 'Kanban moves with fractional positions and version checks', 'Activity history', 'OpenAPI documentation at /api/docs'],
    receives: ['JSON REST requests', 'Bearer JWT access tokens', 'Refresh cookies on /api/auth/*'],
    sends: ['Parameterised SQL to PostgreSQL', 'JSON responses with a consistent error shape', 'Set-Cookie headers for the refresh token', 'Structured JSON logs to stdout'],
    example: {
      caption: 'Pipeline every request passes through (backend/src/app.ts)',
      language: 'text',
      code: `request-id + logging -> helmet -> cors -> json body (100kb)
  -> cookies -> router -> rate limit -> zod validation
  -> handler -> repository (SQL) -> response
  -> central error handler (if anything throws)`,
    },
    failure: 'With two replicas, the other instance keeps serving. Requests in flight on the failed one error out, and until Docker drops it from DNS the proxy can still send it requests (no health checks yet; Nginx fixes this in Phase 8). Docker restarts it, and no one is logged out because durable session state is shared in PostgreSQL. Socket clients reconnect and refetch. On SIGTERM it finishes in-flight requests, removes its heartbeat and unsubscribes before exiting.',
    alternatives: [
      { name: 'Microservices from day one', tradeoff: 'Independent scaling and deploys, but network calls, distributed transactions and many deployments before we know where the boundaries should be.' },
      { name: 'NestJS / Fastify', tradeoff: 'NestJS adds structure through decorators and DI at the cost of ceremony; Fastify is faster. Express keeps the request flow explicit and easy to follow.' },
    ],
    replicas: { count: 2, phase: 3 },
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    kind: 'Database',
    icon: 'postgres',
    phase: 1,
    position: { x: 900, y: 240 },
    tagline: 'Relational source of truth',
    what: 'PostgreSQL 17, the system of record. Tables: `users`, `refresh_tokens` (Phase 1); `workspaces`, `workspace_members`, `projects`, `tasks`, `activity_logs` (Phase 2); plus `schema_migrations`. Messages and comments arrive in later phases.',
    why: 'Collaboration data is relational (users belong to workspaces, tasks to projects) and must stay consistent. PostgreSQL gives transactions, foreign keys, unique constraints and row-level locks: the unique index on email prevents duplicate accounts, and `SELECT ... FOR UPDATE` makes refresh-token rotation race-free.',
    features: ['User accounts and sessions', 'Workspace membership (every permission check)', 'Projects, tasks and board order', 'Activity history, written in the same transaction as each change'],
    receives: ['SQL queries from the API over a connection pool (max 10 per instance)', 'Schema changes (DDL) from the migrate job'],
    sends: ['Query results (rows)', 'Constraint violations (e.g. duplicate email -> 409 EMAIL_TAKEN)'],
    example: {
      caption: 'Refresh-token rotation locks the row so two concurrent refreshes cannot both succeed',
      language: 'sql',
      code: `BEGIN;
SELECT id, family_id, revoked_at, expires_at
  FROM refresh_tokens
 WHERE token_hash = $1
   FOR UPDATE;
INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at) VALUES (...);
UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'rotated' WHERE id = $old;
COMMIT;`,
    },
    failure: '/api/health/ready returns 503 and the System Health page shows PostgreSQL as down. Login, registration and every data read fail with a 500 error. Data is safe on the `postgres-data` Docker volume; once the database is back, the pool reconnects automatically.',
    alternatives: [
      { name: 'MySQL', tradeoff: 'Similar capability; PostgreSQL has richer types (JSONB, arrays), better constraint support and full-text search for later.' },
      { name: 'MongoDB', tradeoff: 'Flexible documents, but relationships and multi-document consistency become application code instead of database guarantees.' },
    ],
  },
  {
    id: 'migrate',
    name: 'Migration job',
    kind: 'One-shot job',
    icon: 'migrate',
    phase: 1,
    position: { x: 900, y: 430 },
    tagline: 'Applies versioned SQL migrations before the API starts',
    what: 'A short-lived container built from the same image as the API. It applies every pending `backend/migrations/NNN_*.sql` file in order, records each in `schema_migrations` with a checksum, then exits.',
    why: 'Schema changes are code: reviewed, versioned and applied identically everywhere. Running them as a separate step means the API never starts against an old schema, and a PostgreSQL advisory lock keeps it safe when several instances start at once.',
    features: ['Creating and evolving the database schema'],
    receives: ['Migration files baked into the image'],
    sends: ['DDL statements (CREATE TABLE, CREATE INDEX, ...) to PostgreSQL'],
    example: {
      caption: 'See what has been applied',
      language: 'sql',
      code: `SELECT name, applied_at FROM schema_migrations ORDER BY name;
-- 001_create_users_and_refresh_tokens.sql | 2026-11-03 13:20:41+00`,
    },
    failure: 'The failing migration is rolled back (each file runs in its own transaction), the job exits non-zero, and Docker Compose does not start the API (`service_completed_successfully`). Editing an already-applied migration is detected by checksum and refused.',
    alternatives: [
      { name: 'Prisma Migrate / Flyway / node-pg-migrate', tradeoff: 'More features (down-migrations, generators). The in-house runner is ~80 lines, so you can read exactly what happens.' },
      { name: 'Migrate on API boot', tradeoff: 'One fewer container, but every instance races to migrate and a bad migration crash-loops the API.' },
    ],
  },

  // ----- Planned components -----
  {
    id: 'redis',
    name: 'Redis',
    kind: 'Cache · rate limits · pub/sub',
    icon: 'redis',
    phase: 3,
    position: { x: 900, y: 40 },
    tagline: 'Shared in-memory state for every API instance',
    what: 'An in-memory data store (Redis 7). Every API instance connects to the same Redis, which makes it the place for state that must be SHARED across instances but is not the source of truth.',
    why: 'Four jobs, all of which break or get worse with several API instances and no shared state. (1) Cache: boards, project headers and member lists are served from memory instead of re-running SQL joins. (2) Rate limits: login attempts are counted once for the whole cluster, not once per instance. (3) Pub/Sub: a change committed on one instance is announced to all of them. (4) Instance registry: each instance heartbeats a TTL key, so any instance can list the cluster.',
    features: [
      'Kanban board, project header and member-list caching',
      'Distributed rate limiting (login + all /api traffic)',
      'Cross-instance domain events (Pub/Sub)',
      'Instance registry shown on System Health',
      'Online presence (45-second connection leases)',
    ],
    receives: [
      'MGET gen:* / GET cache:* / SET … EX 300 (cache-aside)',
      'INCR gen:project:<id> after each committed write',
      'MULTI INCR + PEXPIRE rl:<limiter>:<ip>:<window>',
      'PUBLISH syncspace:events <event JSON>',
      'SET instance:<id> <report> EX 15 every 5 s',
    ],
    sends: ['Cached JSON or a miss', 'Current counter values', 'Every published event to every subscribed instance'],
    example: {
      caption: 'A cached board read, then the write that invalidates it (real keys)',
      language: 'bash',
      code: `MGET gen:project:9f2… gen:workspace:41c… gen:users      # -> 7, 3, 12
GET  "cache:board:9f2…|project:9f2…=7|workspace:41c…=3|users=12"   # HIT or nil
SET  "cache:board:…=7|…" '[{…tasks…}]' EX 300             # on a miss

# after a task move commits in PostgreSQL:
INCR gen:project:9f2…                                    # 7 -> 8: old key is orphaned
PUBLISH syncspace:events '{"type":"task.moved",…,"publishedBy":"syncspace-api-1"}'`,
    },
    failure: 'HTTP domain reads/writes continue with PostgreSQL fallback; live delivery and presence degrade. Cached reads go straight to PostgreSQL (x-cache: BYPASS), rate limits fail open (requests allowed, warning logged), events are skipped (other screens catch up on refetch), and System Health shows only the serving instance. /api/health/ready stays 200 with status "degraded", so instances are not taken out of rotation for a cache outage.',
    alternatives: [
      { name: 'In-process memory per instance', tradeoff: 'Zero latency, but every instance has its own cache (inconsistent), its own rate-limit counters (N x the limit) and no way to tell the others about a change.' },
      { name: 'Memcached', tradeoff: 'A fast cache, but no Pub/Sub, counters with expiry semantics or data structures for presence.' },
      { name: 'PostgreSQL LISTEN/NOTIFY', tradeoff: 'No extra service for events, but adds load to the primary database and caps payloads at 8 KB.' },
    ],
  },
  {
    id: 'socket',
    name: 'Socket.IO',
    kind: 'Real-time gateway',
    icon: 'socket',
    phase: 4,
    position: { x: 600, y: 40 },
    tagline: 'Persistent WebSocket connections for live updates',
    what: 'A WebSocket server attached to each API instance. Each signed-in browser keeps one open connection and joins rooms for the workspaces it belongs to.',
    why: 'Live Kanban updates, chat, presence and notifications need the server to push data the instant it changes, without the browser polling.',
    features: ['Real-time task updates', 'Team chat', 'Online presence', 'Live notifications'],
    receives: ['Authenticated socket connections', 'Chat messages and typing indicators', 'Events from Redis Pub/Sub'],
    sends: ['ID-only workspace:event signals, presence snapshots, typing indicators and membership revocation notices'],
    example: {
      caption: 'After Redis fan-out: deliver only to authorized local sockets',
      language: 'ts',
      code: `// Every API receives the domain event through Redis.\n// Recheck workspace membership, then send the ID-only signal locally.\nsocket.emit('workspace:event', event);`,
    },
    failure: 'Clients reconnect with backoff and refetch missed data. Token expiry closes the socket and triggers a refresh. Redis interruption degrades live delivery; HTTP task/chat APIs keep working. Presence records expire after 45 seconds.',
    alternatives: [
      { name: 'Server-Sent Events', tradeoff: 'Simpler, one-way only; chat needs two-way messaging.' },
      { name: 'Polling', tradeoff: 'Trivial to build, but slow to reflect changes and wasteful at scale.' },
    ],
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ',
    kind: 'Message broker',
    icon: 'rabbitmq',
    phase: 5,
    position: { x: 600, y: 600 },
    tagline: 'Durable job queues with retries and dead-lettering',
    what: 'A message broker that stores jobs in durable queues until a worker confirms it has processed them.',
    why: 'Slow or failure-prone work (emails, notifications, file processing, search indexing) must not slow down user requests, and must not be lost if a worker crashes. RabbitMQ gives acknowledgements, retry queues and dead-letter queues.',
    features: ['Email and in-app notifications', 'Activity processing', 'File processing', 'Search indexing jobs'],
    receives: ['Persistent messages published by the API'],
    sends: ['Messages to worker consumers, redelivered until acknowledged'],
    example: {
      caption: 'Planned: publish a durable notification job',
      language: 'ts',
      code: `channel.publish('syncspace.events', 'notification.requested',
  Buffer.from(JSON.stringify(job)), { persistent: true, messageId: job.id });`,
    },
    failure: 'Planned design: the API stores jobs in an outbox table and republishes when RabbitMQ is back, so nothing is silently dropped.',
    alternatives: [
      { name: 'Kafka (Phase 10)', tradeoff: 'Built for high-volume event streams and replay; heavier to run, and per-message retry/DLQ is less natural.' },
      { name: 'Redis queues (BullMQ)', tradeoff: 'Easy to adopt, but durability depends on Redis persistence settings.' },
    ],
  },
  {
    id: 'workers',
    name: 'Background workers',
    kind: 'Worker processes',
    icon: 'workers',
    phase: 5,
    position: { x: 1200, y: 600 },
    tagline: 'Process queued jobs outside the request path',
    what: 'Separate Node.js processes, built from the same codebase as the API, that consume jobs from RabbitMQ.',
    why: 'They keep the API fast and can be scaled independently of web traffic.',
    features: ['Sending notifications', 'Recording activity', 'Processing uploaded files', 'Indexing search documents'],
    receives: ['Jobs from RabbitMQ'],
    sends: ['Writes to PostgreSQL', 'Events to Redis', 'Documents to Elasticsearch'],
    example: {
      caption: 'Planned: idempotent consumer',
      language: 'ts',
      code: `if (await processed.has(msg.properties.messageId)) return channel.ack(msg);
await handle(job); channel.ack(msg);`,
    },
    failure: 'Planned design: unacknowledged jobs are redelivered to another worker; poison messages land in a dead-letter queue for inspection.',
    alternatives: [{ name: 'In-process async tasks', tradeoff: 'No extra process, but work is lost when the API restarts.' }],
  },
  {
    id: 'minio',
    name: 'MinIO / S3',
    kind: 'Object storage',
    icon: 'minio',
    phase: 6,
    position: { x: 300, y: 600 },
    tagline: 'Stores uploaded attachments',
    what: 'S3-compatible object storage. MinIO runs locally; AWS S3 replaces it in production with no code changes.',
    why: 'Files do not belong in PostgreSQL. Browsers upload directly to storage with short-lived pre-signed URLs, so large files never pass through the API.',
    features: ['Task attachments', 'Chat file sharing'],
    receives: ['File uploads via pre-signed PUT URLs'],
    sends: ['File downloads via pre-signed GET URLs'],
    example: { caption: 'Planned: pre-signed upload', language: 'ts', code: `const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key }), { expiresIn: 300 });` },
    failure: 'Planned design: uploads and downloads fail with a clear error; tasks and chat keep working.',
    alternatives: [{ name: 'Local disk', tradeoff: 'Simple, but breaks as soon as there are two API instances.' }],
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    kind: 'Search engine',
    icon: 'elasticsearch',
    phase: 7,
    position: { x: 1200, y: 430 },
    tagline: 'Full-text search over tasks, comments and messages',
    what: 'A search engine that builds inverted indexes for fast, relevance-ranked full-text search.',
    why: 'Searching across thousands of tasks and messages with typo tolerance and ranking is what it is built for. Indexing happens asynchronously via workers so writes stay fast.',
    features: ['Task search', 'Message and comment search'],
    receives: ['Documents to index from workers', 'Search queries from the API'],
    sends: ['Ranked search results'],
    example: { caption: 'Planned: search query', language: 'text', code: `GET /tasks/_search { "query": { "multi_match": { "query": "login bug", "fields": ["title^2", "description"] } } }` },
    failure: 'Planned design: search shows a degraded message; nothing else is affected because PostgreSQL remains the source of truth and the index can be rebuilt.',
    alternatives: [{ name: 'PostgreSQL full-text search', tradeoff: 'No extra service; weaker relevance tuning at larger scale.' }],
  },
  {
    id: 'nginx',
    name: 'Nginx',
    kind: 'Load balancer',
    icon: 'nginx',
    phase: 8,
    position: { x: 300, y: 40 },
    tagline: 'Reverse proxy and load balancer',
    what: 'A high-performance reverse proxy in front of several API instances.',
    why: 'It will spread traffic across instances, terminate TLS, serve static assets and support WebSocket upgrades, replacing the Phase 1 web proxy.',
    features: ['Load balancing', 'TLS termination', 'Static asset serving'],
    receives: ['All browser HTTP and WebSocket traffic'],
    sends: ['Requests to a healthy API instance'],
    example: { caption: 'Planned: upstream block', language: 'text', code: `upstream api { least_conn; server api-1:4000; server api-2:4000; }` },
    failure: 'Planned design: it is the single entry point, so it runs with a restart policy, and later more than one replica.',
    alternatives: [{ name: 'Traefik / HAProxy / cloud load balancer', tradeoff: 'Comparable; Nginx is the most widely documented.' }],
  },
  {
    id: 'prometheus',
    name: 'Prometheus',
    kind: 'Metrics',
    icon: 'prometheus',
    phase: 9,
    position: { x: 1200, y: 40 },
    tagline: 'Collects time-series metrics',
    what: 'A metrics database that scrapes /metrics from each service every few seconds.',
    why: 'Request rate, latency, error rate, queue depth and cache hit ratio show how the system behaves under real load.',
    features: ['API latency and error rate', 'Queue depth', 'Cache hit/miss'],
    receives: ['Metrics scraped from API and workers'],
    sends: ['Query results to Grafana'],
    example: { caption: 'Planned: p95 latency', language: 'text', code: `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))` },
    failure: 'Planned design: monitoring has a gap; the application is unaffected.',
    alternatives: [{ name: 'Hosted APM (Datadog, New Relic)', tradeoff: 'Less to operate; costs money and data leaves your infrastructure.' }],
  },
  {
    id: 'grafana',
    name: 'Grafana',
    kind: 'Dashboards',
    icon: 'grafana',
    phase: 9,
    position: { x: 1500, y: 40 },
    tagline: 'Visualises metrics',
    what: 'A dashboard tool that queries Prometheus and draws charts and alerts.',
    why: 'Operators need to see trends and get alerted before users notice problems.',
    features: ['Operational dashboards', 'Alerting'],
    receives: ['PromQL query results'],
    sends: ['Dashboards to operators'],
    example: { caption: 'Planned', language: 'text', code: 'Dashboard: SyncSpace API: RPS, p95 latency, 5xx rate' },
    failure: 'Planned design: dashboards are unavailable; metrics keep being collected.',
    alternatives: [{ name: 'Prometheus UI', tradeoff: 'Built in, but basic.' }],
  },
];

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export const CONNECTIONS: ArchConnection[] = [
  { id: 'browser-web', source: 'browser', target: 'web', sourceSide: 'right', targetSide: 'left', label: 'HTTP · app + /api', phase: 1 },
  { id: 'web-api', source: 'web', target: 'api', sourceSide: 'right', targetSide: 'left', label: 'round-robin /api/*', phase: 1 },
  { id: 'api-postgres', source: 'api', target: 'postgres', sourceSide: 'right', targetSide: 'left', label: 'SQL (pg pool)', phase: 1 },
  { id: 'migrate-postgres', source: 'migrate', target: 'postgres', sourceSide: 'top', targetSide: 'bottom', label: 'DDL migrations', phase: 1 },

  { id: 'api-redis', source: 'api', target: 'redis', sourceSide: 'top', targetSide: 'left', label: 'cache · rate limit · pub/sub', phase: 3 },
  { id: 'browser-socket', source: 'browser', target: 'socket', sourceSide: 'top', targetSide: 'left', label: 'WebSocket', phase: 4 },
  { id: 'socket-api', source: 'socket', target: 'api', sourceSide: 'bottom', targetSide: 'top', label: 'in-process', phase: 4 },
  { id: 'socket-redis', source: 'socket', target: 'redis', sourceSide: 'right', targetSide: 'left', label: 'Pub/Sub · presence', phase: 4 },
  { id: 'api-rabbitmq', source: 'api', target: 'rabbitmq', sourceSide: 'bottom', targetSide: 'top', label: 'publish jobs', phase: 5 },
  { id: 'rabbitmq-workers', source: 'rabbitmq', target: 'workers', sourceSide: 'right', targetSide: 'left', label: 'consume (ack)', phase: 5 },
  { id: 'workers-postgres', source: 'workers', target: 'postgres', sourceSide: 'top', targetSide: 'right', label: 'persist', phase: 5 },
  { id: 'workers-redis', source: 'workers', target: 'redis', sourceSide: 'right', targetSide: 'right', label: 'publish events', phase: 5 },
  { id: 'api-minio', source: 'api', target: 'minio', sourceSide: 'bottom', targetSide: 'right', label: 'pre-sign URLs', phase: 6 },
  { id: 'browser-minio', source: 'browser', target: 'minio', sourceSide: 'bottom', targetSide: 'left', label: 'direct upload', phase: 6 },
  { id: 'workers-elasticsearch', source: 'workers', target: 'elasticsearch', sourceSide: 'top', targetSide: 'bottom', label: 'index', phase: 7 },
  { id: 'api-elasticsearch', source: 'api', target: 'elasticsearch', sourceSide: 'right', targetSide: 'left', label: 'search', phase: 7 },
  { id: 'browser-nginx', source: 'browser', target: 'nginx', sourceSide: 'top', targetSide: 'left', label: 'HTTPS / WSS', phase: 8 },
  { id: 'nginx-api', source: 'nginx', target: 'api', sourceSide: 'right', targetSide: 'top', label: 'load balance', phase: 8 },
  { id: 'prometheus-api', source: 'prometheus', target: 'api', sourceSide: 'bottom', targetSide: 'right', label: 'scrape /metrics', phase: 9 },
  { id: 'grafana-prometheus', source: 'grafana', target: 'prometheus', sourceSide: 'left', targetSide: 'right', label: 'PromQL', phase: 9 },
];

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export const FLOWS: ArchFlow[] = [
  {
    id: 'auth',
    name: 'User authentication',
    phase: 1,
    summary: 'How signing in creates a session, and how the session is silently renewed later.',
    steps: [
      {
        title: 'User submits the sign-in form',
        detail: 'React calls POST /api/auth/login with { email, password }. The browser sends it to the same origin it loaded the app from.',
        nodes: ['browser'],
        edges: [{ id: 'browser-web' }],
      },
      {
        title: 'Proxy forwards the request to the API',
        detail: 'The web container forwards /api/* to the Node.js API and adds X-Forwarded-For, so the API rate-limits by the real client IP rather than the proxy’s.',
        nodes: ['web', 'api'],
        edges: [{ id: 'web-api' }],
      },
      {
        title: 'Validate and rate-limit',
        detail: 'The login limiter increments rl:auth:<ip>:<window> in Redis: 20 attempts per IP per 15 minutes, counted across ALL instances. Then a Zod schema trims and lower-cases the email and rejects malformed input with field-level 400 errors.',
        nodes: ['api', 'redis'],
        edges: [{ id: 'api-redis' }],
      },
      {
        title: 'Look up the user',
        detail: 'SELECT ... FROM users WHERE email = $1. Parameterised SQL means user input can never change the query itself.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'Verify the password',
        detail: 'PostgreSQL returns the bcrypt hash, and the API checks the password against it. bcrypt is slow on purpose (~250 ms). For unknown emails the API checks against a dummy hash, so the response time does not reveal which emails have accounts.',
        nodes: ['postgres', 'api'],
        edges: [{ id: 'api-postgres', reverse: true }],
      },
      {
        title: 'Store a new refresh session',
        detail: 'The API generates 256 random bits as the refresh token and INSERTs only its SHA-256 hash into refresh_tokens, together with a new family_id that identifies this login.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'Respond with both tokens',
        detail: 'The JSON body carries a 15-minute JWT access token, which React keeps in memory. The refresh token goes in an httpOnly, SameSite=Strict cookie scoped to /api/auth, where JavaScript cannot read it.',
        nodes: ['api', 'web', 'browser'],
        edges: [
          { id: 'web-api', reverse: true },
          { id: 'browser-web', reverse: true },
        ],
      },
      {
        title: 'Authenticated requests',
        detail: 'Later requests send Authorization: Bearer <jwt>. The API verifies the signature and expiry in memory, with no database lookup, so any API instance can authenticate any request.',
        nodes: ['browser', 'web', 'api'],
        edges: [{ id: 'browser-web' }, { id: 'web-api' }],
      },
      {
        title: 'Silent refresh with rotation',
        detail: 'When the JWT expires, or the page reloads, the browser POSTs /api/auth/refresh with the cookie. In one transaction the API locks the token row (FOR UPDATE), issues a new token in the same family and marks the old one as rotated. If a rotated token is replayed later, the whole family is revoked, because that is a sign of theft.',
        nodes: ['browser', 'web', 'api', 'postgres'],
        edges: [{ id: 'browser-web' }, { id: 'web-api' }, { id: 'api-postgres' }],
      },
    ],
  },
  {
    id: 'migration',
    name: 'Startup & schema migration',
    phase: 1,
    summary: 'What happens, in order, when you run docker compose up.',
    steps: [
      {
        title: 'PostgreSQL starts',
        detail: 'Docker starts PostgreSQL and probes it with pg_isready every 5 seconds. On first start an init script also creates the syncspace_test database for the test suite.',
        nodes: ['postgres'],
        edges: [],
      },
      {
        title: 'Migration job takes a lock',
        detail: 'Once PostgreSQL is healthy, the migrate container connects and takes a PostgreSQL advisory lock, so even several starting instances would migrate one at a time.',
        nodes: ['migrate', 'postgres'],
        edges: [{ id: 'migrate-postgres' }],
      },
      {
        title: 'Pending migrations are applied',
        detail: 'Each new NNN_*.sql file runs in its own transaction and is recorded in schema_migrations with a SHA-256 checksum. If an applied file has been edited since, the job refuses to continue.',
        nodes: ['migrate', 'postgres'],
        edges: [{ id: 'migrate-postgres' }],
      },
      {
        title: 'API starts only after success',
        detail: 'Docker Compose starts the API only when migrate has exited with code 0 (service_completed_successfully).',
        nodes: ['migrate', 'api'],
        edges: [],
      },
      {
        title: 'Readiness check',
        detail: 'Docker polls /api/health/ready, which runs SELECT 1 against PostgreSQL. Only when the API is healthy does the web container start serving users.',
        nodes: ['api', 'postgres', 'web'],
        edges: [{ id: 'api-postgres' }],
      },
    ],
  },
  {
    id: 'task-creation',
    name: 'Task creation',
    phase: 2,
    summary: 'Creating a task: authorisation, race-free numbering and history in one transaction.',
    steps: [
      {
        title: 'User submits the new-task form',
        detail: 'React sends POST /api/projects/:projectId/tasks with title, status, priority, assignee and due date, plus the Bearer access token.',
        nodes: ['browser', 'web'],
        edges: [{ id: 'browser-web' }],
      },
      {
        title: 'Validate the input',
        detail: 'The proxy forwards the request. Zod checks the body (title 1–200 chars, a known status and priority, a YYYY-MM-DD date) and strips unknown fields before any SQL runs.',
        nodes: ['web', 'api'],
        edges: [{ id: 'web-api' }],
      },
      {
        title: 'Authorise via workspace membership',
        detail: 'The API loads the project, then looks up the caller in workspace_members for that project’s workspace. Non-members get 404, so outsiders cannot even confirm the project exists. An assignee must also be a member.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'Reserve the next task number',
        detail: 'UPDATE projects SET task_counter = task_counter + 1 … RETURNING row-locks the project until commit, so eight people creating tasks at the same moment still get WEB-1 … WEB-8 with no duplicates.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'Insert the task and its history together',
        detail: 'In the same transaction: INSERT the task at the bottom of its column (max position + 1024) and INSERT an activity_logs row. Either both commit or neither does, so history can never disagree with the board.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'After commit: invalidate and announce',
        detail: 'Only once the transaction has committed: INCR gen:project:<id> so every instance’s cached board misses on the next read, then PUBLISH a task.created event that every API instance receives.',
        nodes: ['api', 'redis'],
        edges: [{ id: 'api-redis' }],
      },
      {
        title: 'Respond and refresh the views',
        detail: '201 Created with the full task. React Query invalidates the board, project counts, My Tasks and the dashboard so they refetch. Authorized teammates receive the workspace signal through Socket.IO and refetch the affected board without refreshing the page.',
        nodes: ['api', 'web', 'browser'],
        edges: [
          { id: 'web-api', reverse: true },
          { id: 'browser-web', reverse: true },
        ],
      },
    ],
  },
  {
    id: 'kanban-move',
    name: 'Kanban card move',
    phase: 2,
    summary: 'Dragging a card: optimistic UI, fractional positions, optimistic concurrency.',
    steps: [
      {
        title: 'Optimistic update in the browser',
        detail: 'When the card is dropped, React Query immediately rewrites its cached board so the card stays where you put it, and keeps a snapshot to roll back to.',
        nodes: ['browser'],
        edges: [],
      },
      {
        title: 'Send the move',
        detail: 'POST /api/tasks/:id/move { status, afterTaskId, version }. afterTaskId is the card now directly above (null = top); version is the copy the user was looking at.',
        nodes: ['browser', 'web', 'api'],
        edges: [{ id: 'browser-web' }, { id: 'web-api' }],
      },
      {
        title: 'Serialise moves on this board',
        detail: 'SELECT … FROM projects … FOR NO KEY UPDATE, then SELECT the task FOR UPDATE. Every board write takes the locks in the same order (project, then task), which rules out deadlocks.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'Reject stale edits',
        detail: 'If tasks.version no longer matches the version the client sent, someone else changed the card first. The API answers 409 VERSION_CONFLICT instead of silently overwriting their change.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres', reverse: true }],
      },
      {
        title: 'Compute a fractional position',
        detail: 'The new position is the midpoint between the neighbours (e.g. 1024 and 2048 give 1536), so only one row changes. When the gap gets too small, the column is re-spaced to 1024, 2048, … first.',
        nodes: ['api'],
        edges: [],
      },
      {
        title: 'Persist and record history',
        detail: 'UPDATE the status, position and version (+1), and completed_at if it moved into Completed, plus a task.status_changed activity row, all in one transaction.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'After commit: invalidate and announce',
        detail: 'INCR the project’s cache generation (before responding, so the client’s immediate refetch cannot read the old board) and PUBLISH task.moved to all instances.',
        nodes: ['api', 'redis'],
        edges: [{ id: 'api-redis' }],
      },
      {
        title: 'Confirm or roll back',
        detail: 'On 200 the cache takes the server’s copy. On 409 or any error the snapshot is restored, a toast explains why, and the board refetches the latest state.',
        nodes: ['api', 'web', 'browser'],
        edges: [
          { id: 'web-api', reverse: true },
          { id: 'browser-web', reverse: true },
        ],
      },
    ],
  },
  {
    id: 'cached-read',
    name: 'Cached board read',
    phase: 3,
    summary: 'Cache-aside with generation keys: permissions live, data from memory.',
    steps: [
      {
        title: 'Open a board',
        detail: 'React Query asks for GET /api/projects/:id/tasks: on page load, on every window refocus and after every write.',
        nodes: ['browser', 'web'],
        edges: [{ id: 'browser-web' }],
      },
      {
        title: 'Next replica in turn',
        detail: 'The proxy resolves "api" to every replica and sends this request to the next one. Either instance can answer: none keeps per-user state.',
        nodes: ['web', 'api'],
        edges: [{ id: 'web-api' }],
      },
      {
        title: 'Authorise against PostgreSQL, always',
        detail: 'Membership is checked live on every request. Permissions are never cached: a removed member must lose access immediately, not when a cache entry expires.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'Build the key from generations',
        detail: 'MGET gen:project:<id>, gen:workspace:<id>, gen:users returns e.g. 7, 3, 12. The key becomes cache:board:<id>|project=7|workspace=3|users=12, then GET it.',
        nodes: ['api', 'redis'],
        edges: [{ id: 'api-redis' }],
      },
      {
        title: 'HIT: answer from memory',
        detail: 'The JSON comes back in well under a millisecond and is returned as-is with x-cache: HIT. No board query runs in PostgreSQL.',
        nodes: ['redis', 'api'],
        edges: [{ id: 'api-redis', reverse: true }],
      },
      {
        title: 'MISS: load and store',
        detail: 'On a miss, the board query runs in PostgreSQL; the result is returned immediately (x-cache: MISS) and SET … EX 300 in the background, so a slow Redis never delays the response.',
        nodes: ['api', 'postgres', 'redis'],
        edges: [{ id: 'api-postgres' }, { id: 'api-redis' }],
      },
      {
        title: 'Response',
        detail: 'The x-served-by and x-cache headers show which replica answered and where the data came from (open DevTools → Network).',
        nodes: ['api', 'web', 'browser'],
        edges: [
          { id: 'web-api', reverse: true },
          { id: 'browser-web', reverse: true },
        ],
      },
    ],
  },
  {
    id: 'event-distribution',
    name: 'Write → invalidate → publish',
    phase: 3,
    summary: 'How one instance’s write reaches every instance’s cache and event stream.',
    steps: [
      {
        title: 'A write lands on one replica',
        detail: 'For example POST /api/tasks/:id/move arrives at syncspace-api-1.',
        nodes: ['browser', 'web', 'api'],
        edges: [{ id: 'browser-web' }, { id: 'web-api' }],
      },
      {
        title: 'Persist first',
        detail: 'The transaction commits in PostgreSQL. Nothing is invalidated or announced before this point: a rolled-back write must leave no trace.',
        nodes: ['api', 'postgres'],
        edges: [{ id: 'api-postgres' }],
      },
      {
        title: 'Invalidate for the whole cluster',
        detail: 'INCR gen:project:<id>. Every instance builds its cache keys from the same counters, so all of them miss on their next read. Readers that were mid-load store under the old generation, which nobody reads any more.',
        nodes: ['api', 'redis'],
        edges: [{ id: 'api-redis' }],
      },
      {
        title: 'Publish the event',
        detail: 'PUBLISH syncspace:events {"type":"task.moved","publishedBy":"syncspace-api-1",…}. Fire-and-forget: if Redis is down the write still succeeds.',
        nodes: ['api', 'redis'],
        edges: [{ id: 'api-redis' }],
      },
      {
        title: 'Every replica receives it',
        detail: 'Redis delivers the message to every subscribed instance, including the publisher. Each one drops duplicates by event id and records it (see System Health → Event bus: received by syncspace-api-1 and syncspace-api-2). The real-time subscriber checks current workspace membership and pushes it only to authorized sockets connected to that API.',
        nodes: ['redis', 'api'],
        edges: [{ id: 'api-redis', reverse: true }],
      },
    ],
  },
  {
    id: 'rate-limit',
    name: 'Distributed rate limiting',
    phase: 3,
    summary: 'One shared counter per client, whichever replica answers.',
    steps: [
      {
        title: 'A login attempt arrives',
        detail: 'POST /api/auth/login. Attempts alternate between replicas because of round-robin.',
        nodes: ['browser', 'web', 'api'],
        edges: [{ id: 'browser-web' }, { id: 'web-api' }],
      },
      {
        title: 'Count it in Redis, atomically',
        detail: 'MULTI; INCR rl:auth:<client ip>:<window number>; PEXPIRE …; EXEC. One round trip; the key expires on its own when the 15-minute window ends.',
        nodes: ['api', 'redis'],
        edges: [{ id: 'api-redis' }],
      },
      {
        title: 'Same counter on every replica',
        detail: 'With in-memory counters, 2 replicas would allow 2 x 20 attempts. Here attempt 21 is rejected no matter which replica gets it.',
        nodes: ['redis', 'api'],
        edges: [{ id: 'api-redis', reverse: true }],
      },
      {
        title: 'Over the limit: 429',
        detail: 'Response 429 RATE_LIMITED with Retry-After and RateLimit-* headers. Under the limit, the request continues to bcrypt and PostgreSQL as usual.',
        nodes: ['api', 'web', 'browser'],
        edges: [
          { id: 'web-api', reverse: true },
          { id: 'browser-web', reverse: true },
        ],
      },
      {
        title: 'If Redis is down: fail open',
        detail: 'The request is allowed and a warning is logged. Login keeps working, and bcrypt still makes every guess slow. Choosing fail-open trades some protection for availability.',
        nodes: ['api'],
        edges: [],
      },
    ],
  },
  {
    id: 'realtime-updates',
    name: 'Real-time task updates',
    phase: 4,
    summary: 'Moving a card updates every teammate’s board instantly.',
    steps: [
      { title: 'Move the card', detail: 'POST /api/tasks/:id/move with status, afterTaskId and version.', nodes: ['browser', 'web', 'api'], edges: [{ id: 'browser-web' }, { id: 'web-api' }] },
      { title: 'Persist first', detail: 'UPDATE tasks ... COMMIT. Nothing is broadcast until the write succeeds.', nodes: ['api', 'postgres'], edges: [{ id: 'api-postgres' }] },
      { title: 'Invalidate and publish', detail: 'INCR the project’s cache generation and PUBLISH task.moved (both already happen since Phase 3).', nodes: ['api', 'redis'], edges: [{ id: 'api-redis' }] },
      { title: 'Fan out', detail: 'Every API receives the event through the existing Redis domain-event bus. No second adapter broadcast is used.', nodes: ['redis', 'socket'], edges: [{ id: 'socket-redis', reverse: true }] },
      { title: 'Broadcast', detail: 'After a live membership check, local members receive workspace:event. React Query refetches the affected board and task; drag updates wait until drop.', nodes: ['socket', 'browser'], edges: [{ id: 'browser-socket', reverse: true }] },
    ],
  },
  {
    id: 'chat',
    name: 'Chat messaging',
    phase: 4,
    summary: 'A persisted workspace conversation with live delivery.',
    steps: [
      { title: 'Send', detail: 'The composer POSTs /api/chat/:workspaceId/messages with body and a unique clientId. The server also supports chat:send over its socket.', nodes: ['browser', 'web', 'api'], edges: [{ id: 'browser-web' }, { id: 'web-api' }] },
      { title: 'Authorize and persist', detail: 'Check membership, then INSERT chat_messages. The same author/clientId cannot create a duplicate message.', nodes: ['api', 'postgres'], edges: [{ id: 'api-postgres' }] },
      { title: 'Distribute', detail: 'After commit, publish the chat.message signal through the domain-event bus.', nodes: ['api', 'redis'], edges: [{ id: 'api-redis' }] },
      { title: 'Deliver', detail: 'Every API checks room membership and emits a local workspace:event. Authorized browsers fetch the saved message history.', nodes: ['redis', 'socket', 'browser'], edges: [{ id: 'socket-redis', reverse: true }, { id: 'browser-socket', reverse: true }] },
    ],
  },
  {
    id: 'presence', name: 'Online presence', phase: 4,
    summary: 'Multiple tabs count as one online member; crashed connections expire.',
    steps: [
      { title: 'Join securely', detail: 'Verify the JWT and workspace membership before joining workspace:id.', nodes: ['browser', 'socket', 'api', 'postgres'], edges: [{ id: 'browser-socket' }, { id: 'socket-api' }, { id: 'api-postgres' }] },
      { title: 'Refresh presence', detail: 'Each connected tab renews a Redis sorted-set lease every 15 seconds; it expires after 45 seconds without a heartbeat.', nodes: ['socket', 'redis'], edges: [{ id: 'socket-redis' }] },
      { title: 'Show online members', detail: 'Redis Pub/Sub announces presence changes. Each API sends authorized local browsers the deduplicated member IDs.', nodes: ['redis', 'socket', 'browser'], edges: [{ id: 'socket-redis', reverse: true }, { id: 'browser-socket', reverse: true }] },
    ],
  },
  {
    id: 'notifications',
    name: 'Background notification processing',
    phase: 5,
    summary: 'Assignments trigger durable, retried notifications.',
    steps: [
      { title: 'Publish job', detail: 'After commit, the API publishes notification.requested as a persistent message.', nodes: ['api', 'rabbitmq'], edges: [{ id: 'api-rabbitmq' }] },
      { title: 'Consume', detail: 'A worker receives it with manual acknowledgement.', nodes: ['rabbitmq', 'workers'], edges: [{ id: 'rabbitmq-workers' }] },
      { title: 'Store idempotently', detail: 'INSERT ... ON CONFLICT (message_id) DO NOTHING prevents duplicates.', nodes: ['workers', 'postgres'], edges: [{ id: 'workers-postgres' }] },
      { title: 'Push live', detail: 'The worker publishes to Redis, and Socket.IO notifies the user.', nodes: ['workers', 'redis', 'socket', 'browser'], edges: [{ id: 'workers-redis' }, { id: 'socket-redis', reverse: true }, { id: 'browser-socket', reverse: true }] },
      { title: 'On failure', detail: 'Failed jobs go to a retry queue with a delay; after 5 attempts they go to the dead-letter queue.', nodes: ['rabbitmq'], edges: [] },
    ],
  },
  {
    id: 'file-upload',
    name: 'File upload',
    phase: 6,
    summary: 'Uploading an attachment directly to object storage.',
    steps: [
      { title: 'Request upload URL', detail: 'POST /api/attachments/presign.', nodes: ['browser', 'web', 'api'], edges: [{ id: 'browser-web' }, { id: 'web-api' }] },
      { title: 'Sign', detail: 'The API signs a 5-minute PUT URL.', nodes: ['api', 'minio'], edges: [{ id: 'api-minio' }] },
      { title: 'Upload directly', detail: 'The browser PUTs the file to MinIO; the bytes never pass through the API.', nodes: ['browser', 'minio'], edges: [{ id: 'browser-minio' }] },
      { title: 'Confirm', detail: 'The API stores the metadata and queues a processing job.', nodes: ['api', 'postgres', 'rabbitmq'], edges: [{ id: 'api-postgres' }, { id: 'api-rabbitmq' }] },
    ],
  },
  {
    id: 'search-indexing',
    name: 'Search indexing',
    phase: 7,
    summary: 'Keeping the search index in sync asynchronously.',
    steps: [
      { title: 'Write', detail: 'The task is saved to PostgreSQL.', nodes: ['api', 'postgres'], edges: [{ id: 'api-postgres' }] },
      { title: 'Queue', detail: 'A search.index job is published.', nodes: ['api', 'rabbitmq'], edges: [{ id: 'api-rabbitmq' }] },
      { title: 'Index', detail: 'A worker upserts the document in Elasticsearch.', nodes: ['workers', 'elasticsearch'], edges: [{ id: 'rabbitmq-workers' }, { id: 'workers-elasticsearch' }] },
      { title: 'Search', detail: 'GET /api/search?q= queries Elasticsearch.', nodes: ['api', 'elasticsearch'], edges: [{ id: 'api-elasticsearch' }] },
    ],
  },
];

export function componentById(id: string): ArchComponent | undefined {
  return COMPONENTS.find((component) => component.id === id);
}

/** Components this one talks to, derived from the connection list (single source of truth). */
export function neighboursOf(id: string, includePlanned: boolean): { component: ArchComponent; connection: ArchConnection; direction: 'out' | 'in' }[] {
  return CONNECTIONS.filter((c) => (c.source === id || c.target === id) && (includePlanned || isImplemented(c))).flatMap((connection) => {
    const otherId = connection.source === id ? connection.target : connection.source;
    const component = componentById(otherId);
    return component ? [{ component, connection, direction: connection.source === id ? ('out' as const) : ('in' as const) }] : [];
  });
}
