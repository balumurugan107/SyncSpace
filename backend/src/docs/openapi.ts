/**
 * OpenAPI 3.1 description of the REST API, served at /api/docs.
 * Keep in sync with the route files when endpoints change (the integration tests
 * assert every documented path is mounted).
 */
const errorResponse = {
  description: 'Error',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
};

const sessionResponse = {
  description: 'Signed in. Refresh token is set as the httpOnly `syncspace_rt` cookie.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthSession' } } },
};


const bearer = [{ bearerAuth: [] }];
const json = (schema: object) => ({ required: true, content: { 'application/json': { schema } } });
const ok = (description: string) => ({ description });
const id = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const standardErrors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse };
const activityParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
  { name: 'before', in: 'query', schema: { type: 'string' }, description: 'Activity id cursor (newest first)' },
];
const taskStatus = { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'] };
const taskPriority = { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] };
const taskFields = {
  title: { type: 'string', maxLength: 200 },
  description: { type: 'string', maxLength: 10000 },
  status: taskStatus,
  priority: taskPriority,
  assigneeId: { type: ['string', 'null'], format: 'uuid', description: 'Must be a workspace member' },
  dueDate: { type: ['string', 'null'], format: 'date' },
};

const phase3Paths = {
  '/system/instances': {
    get: {
      tags: ['System'],
      summary: 'Live API instances (Redis heartbeat registry) with per-instance metrics, plus Redis stats',
      security: bearer,
      responses: { 200: ok('Cluster view'), 401: errorResponse },
    },
  },
  '/system/events': {
    get: {
      tags: ['System'],
      summary: 'Domain events received over Redis Pub/Sub by the serving instance (your workspaces only)',
      security: bearer,
      responses: { 200: ok('Recent events'), 401: errorResponse },
    },
  },
};

const phase2Paths = {
  '/workspaces': {
    get: { tags: ['Workspaces'], summary: 'Workspaces I belong to (with my role and counts)', security: bearer, responses: { 200: ok('Workspaces'), 401: errorResponse } },
    post: {
      tags: ['Workspaces'],
      summary: 'Create a workspace (you become owner)',
      security: bearer,
      requestBody: json({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } }),
      responses: { 201: ok('Created'), ...standardErrors },
    },
  },
  '/workspaces/{workspaceId}': {
    parameters: [id('workspaceId')],
    get: { tags: ['Workspaces'], summary: 'Workspace details', security: bearer, responses: { 200: ok('Workspace'), ...standardErrors } },
    patch: {
      tags: ['Workspaces'],
      summary: 'Rename / describe (admin)',
      security: bearer,
      requestBody: json({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } }),
      responses: { 200: ok('Updated'), ...standardErrors },
    },
    delete: { tags: ['Workspaces'], summary: 'Delete with all projects and tasks (owner)', security: bearer, responses: { 204: ok('Deleted'), ...standardErrors } },
  },
  '/workspaces/{workspaceId}/members': {
    parameters: [id('workspaceId')],
    get: { tags: ['Members'], summary: 'List members', security: bearer, responses: { 200: ok('Members'), ...standardErrors } },
    post: {
      tags: ['Members'],
      summary: 'Add an existing user by email (admin)',
      security: bearer,
      requestBody: json({ type: 'object', required: ['email'], properties: { email: { type: 'string' }, role: { type: 'string', enum: ['admin', 'member'] } } }),
      responses: { 201: ok('Added'), ...standardErrors, 409: errorResponse },
    },
  },
  '/workspaces/{workspaceId}/members/{userId}': {
    parameters: [id('workspaceId'), id('userId')],
    patch: {
      tags: ['Members'],
      summary: 'Change role (admin; not the owner)',
      security: bearer,
      requestBody: json({ type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'member'] } } }),
      responses: { 200: ok('Updated'), ...standardErrors },
    },
    delete: { tags: ['Members'], summary: 'Remove a member (admin) or leave (yourself)', security: bearer, responses: { 204: ok('Removed'), ...standardErrors } },
  },
  '/workspaces/{workspaceId}/projects': {
    parameters: [id('workspaceId')],
    get: { tags: ['Projects'], summary: 'Projects in a workspace', security: bearer, responses: { 200: ok('Projects'), ...standardErrors } },
    post: {
      tags: ['Projects'],
      summary: 'Create a project (admin)',
      security: bearer,
      requestBody: json({
        type: 'object',
        required: ['name', 'key'],
        properties: { name: { type: 'string' }, key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9]{1,5}$' }, description: { type: 'string' } },
      }),
      responses: { 201: ok('Created'), ...standardErrors, 409: errorResponse },
    },
  },
  '/workspaces/{workspaceId}/activity': {
    parameters: [id('workspaceId'), ...activityParams],
    get: { tags: ['Activity'], summary: 'Workspace activity history', security: bearer, responses: { 200: ok('Activity'), ...standardErrors } },
  },
  '/projects': {
    get: { tags: ['Projects'], summary: 'Projects across all my workspaces', security: bearer, responses: { 200: ok('Projects'), 401: errorResponse } },
  },
  '/projects/{projectId}': {
    parameters: [id('projectId')],
    get: { tags: ['Projects'], summary: 'Project with task counts and my role', security: bearer, responses: { 200: ok('Project'), ...standardErrors } },
    patch: {
      tags: ['Projects'],
      summary: 'Rename / describe (admin). The key is immutable.',
      security: bearer,
      requestBody: json({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } }),
      responses: { 200: ok('Updated'), ...standardErrors },
    },
    delete: { tags: ['Projects'], summary: 'Delete project and its tasks (admin)', security: bearer, responses: { 204: ok('Deleted'), ...standardErrors } },
  },
  '/projects/{projectId}/tasks': {
    parameters: [id('projectId')],
    get: { tags: ['Tasks'], summary: 'Kanban board: all tasks ordered by column position', security: bearer, responses: { 200: ok('Tasks'), ...standardErrors } },
    post: {
      tags: ['Tasks'],
      summary: 'Create a task (gets the next key, e.g. WEB-12)',
      security: bearer,
      requestBody: json({ type: 'object', required: ['title'], properties: taskFields }),
      responses: { 201: ok('Created'), ...standardErrors },
    },
  },
  '/projects/{projectId}/activity': {
    parameters: [id('projectId'), ...activityParams],
    get: { tags: ['Activity'], summary: 'Project activity history', security: bearer, responses: { 200: ok('Activity'), ...standardErrors } },
  },
  '/tasks/{taskId}': {
    parameters: [id('taskId')],
    get: { tags: ['Tasks'], summary: 'Task details', security: bearer, responses: { 200: ok('Task'), ...standardErrors } },
    patch: {
      tags: ['Tasks'],
      summary: 'Update fields. Send `version` to get 409 VERSION_CONFLICT instead of overwriting a newer change.',
      security: bearer,
      requestBody: json({ type: 'object', properties: { ...taskFields, version: { type: 'integer' } } }),
      responses: { 200: ok('Updated'), ...standardErrors, 409: errorResponse },
    },
    delete: { tags: ['Tasks'], summary: 'Delete (reporter or admin)', security: bearer, responses: { 204: ok('Deleted'), ...standardErrors } },
  },
  '/tasks/{taskId}/move': {
    parameters: [id('taskId')],
    post: {
      tags: ['Tasks'],
      summary: 'Kanban drag-and-drop: set column and place after another card (null = top)',
      security: bearer,
      requestBody: json({
        type: 'object',
        required: ['status', 'afterTaskId'],
        properties: { status: taskStatus, afterTaskId: { type: ['string', 'null'], format: 'uuid' }, version: { type: 'integer' } },
      }),
      responses: { 200: ok('Moved'), ...standardErrors, 409: errorResponse },
    },
  },
  '/tasks/{taskId}/activity': {
    parameters: [id('taskId'), ...activityParams],
    get: { tags: ['Activity'], summary: 'Task history', security: bearer, responses: { 200: ok('Activity'), ...standardErrors } },
  },
  '/me/tasks': {
    get: {
      tags: ['Me'],
      summary: 'Tasks assigned to me across all workspaces',
      security: bearer,
      parameters: [{ name: 'scope', in: 'query', schema: { type: 'string', enum: ['open', 'all'], default: 'open' } }],
      responses: { 200: ok('Tasks'), 401: errorResponse },
    },
  },
  '/me/dashboard': {
    get: { tags: ['Me'], summary: 'Dashboard counts and recent activity', security: bearer, responses: { 200: ok('Summary'), 401: errorResponse } },
  },
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'SyncSpace API',
    version: '0.3.0',
    description:
      'REST API for SyncSpace. Phase 1: authentication, users, health. Phase 2: workspaces, members, projects, tasks (Kanban), activity history. Phase 3: Redis caching, distributed rate limiting, multiple instances.\n\n' +
      '**Response headers.** `x-served-by`: the API instance that handled the request. `x-cache`: HIT | MISS | BYPASS on cached reads (board, project, members). ' +
      '`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on every /api response; 429 responses add `Retry-After`.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'syncspace_rt' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', examples: ['VALIDATION_ERROR'] },
              message: { type: 'string' },
              details: {},
              requestId: { type: 'string' },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          displayName: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          lastLoginAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      AuthSession: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          accessToken: { type: 'string' },
          expiresIn: { type: 'integer', description: 'Access token lifetime in seconds' },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account and sign in',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'displayName'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8, description: 'Must contain a letter and a number' },
                  displayName: { type: 'string', maxLength: 80 },
                },
              },
            },
          },
        },
        responses: { 201: sessionResponse, 400: errorResponse, 409: errorResponse, 429: errorResponse },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: { email: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: sessionResponse, 400: errorResponse, 401: errorResponse, 429: errorResponse },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh cookie and get a new access token',
        security: [{ refreshCookie: [] }],
        responses: { 200: sessionResponse, 401: errorResponse },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'End the current session',
        security: [{ refreshCookie: [] }],
        responses: { 204: { description: 'Signed out' } },
      },
    },
    '/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'End every session of the current user',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'All sessions revoked' }, 401: errorResponse },
      },
    },
    '/auth/sessions': {
      get: {
        tags: ['Auth'],
        summary: 'List active sign-ins of the current user',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Active sessions' }, 401: errorResponse },
      },
    },
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Current user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Profile',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          401: errorResponse,
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Update the current user profile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['displayName'],
                properties: { displayName: { type: 'string', maxLength: 80 } },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated profile' }, 400: errorResponse, 401: errorResponse },
      },
    },
    '/health/live': {
      get: { tags: ['Health'], summary: 'Liveness probe', responses: { 200: { description: 'Process is running' } } },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe with dependency status',
        responses: { 200: { description: 'Ready' }, 503: { description: 'A dependency is down' } },
      },
    },
    ...phase2Paths,
    ...phase3Paths,
    '/chat/{workspaceId}/messages': {
      parameters: [id('workspaceId')],
      get: { tags: ['Chat'], summary: 'Workspace messages, newest first with keyset pagination', security: bearer,
        parameters: [{ name: 'before', in: 'query', schema: { type: 'string', format: 'uuid' } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 40 } }],
        responses: { 200: ok('Messages and nextCursor (oldest returned message ID, or null)'), ...standardErrors } },
      post: { tags: ['Chat'], summary: 'Persist a message before broadcasting; retries with the same clientId return the original', security: bearer,
        requestBody: json({ type: 'object', required: ['body', 'clientId'], properties: { body: { type: 'string', minLength: 1, maxLength: 4000 }, clientId: { type: 'string', format: 'uuid' } } }),
        responses: { 201: ok('Saved message'), ...standardErrors, 409: errorResponse } },
    },
    '/chat/{workspaceId}/presence': {
      parameters: [id('workspaceId')],
      get: { tags: ['Chat'], summary: 'Online workspace member IDs (available=false when Redis is unavailable)', security: bearer,
        responses: { 200: ok('userIds and available'), ...standardErrors } },
    },
  },
} as const;
