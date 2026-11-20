import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env.js';
import { openApiDocument } from './docs/openapi.js';
import { instance, metrics } from './infrastructure/instance.js';
import { logger } from './infrastructure/logging/logger.js';
import { rateLimit } from './infrastructure/rate-limit/rate-limit.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { meRouter } from './modules/me/me.routes.js';
import { projectRouter } from './modules/projects/project.routes.js';
import { systemRouter } from './modules/system/system.routes.js';
import { taskRouter } from './modules/tasks/task.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { workspaceRouter } from './modules/workspaces/workspace.routes.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';

/**
 * Builds the Express application without starting a server, so tests can mount it
 * in-process with supertest. Each business module contributes one router; they only
 * talk to each other through exported services/repositories, which keeps the seams
 * where a module could later be extracted into its own service.
 */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    }),
  );
  // Which instance answered: makes load balancing visible in DevTools and tests.
  app.use((_req, res, next) => {
    metrics.requests += 1;
    res.setHeader('x-served-by', instance.id);
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      exposedHeaders: ['x-request-id', 'x-served-by', 'x-cache', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Health probes are registered before the limiter so they are never throttled.
  app.use('/api/health', healthRouter);
  app.use('/api', rateLimit({ name: 'api', limit: config.API_RATE_LIMIT_MAX, windowMs: config.API_RATE_LIMIT_WINDOW_MS }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/me', meRouter);
  app.use('/api/workspaces', workspaceRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/system', systemRouter);

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/api/docs',
    // Swagger UI ships inline scripts/styles, so relax the CSP for this path only.
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'SyncSpace API' }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
