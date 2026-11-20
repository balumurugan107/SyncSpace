import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApiDocument } from '../../src/docs/openapi.js';
import { pool } from '../../src/infrastructure/database/pool.js';
import { app, migrateTestDatabase, closeConnections } from './helpers.js';

beforeAll(migrateTestDatabase);
afterAll(closeConnections);

describe('health endpoints', () => {
  it('liveness answers without touching dependencies', async () => {
    await request(app).get('/api/health/live').expect(200, { status: 'ok' });
  });

  it('readiness reports PostgreSQL status', async () => {
    const res = await request(app).get('/api/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.components.postgres.status).toBe('up');
  });
});

describe('cross-cutting behaviour', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('echoes or generates a request id for tracing', async () => {
    const res = await request(app).get('/api/health/live').set('x-request-id', 'trace-123');
    expect(res.headers['x-request-id']).toBe('trace-123');
    const generated = await request(app).get('/api/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('API documentation', () => {
  it('serves the OpenAPI document', async () => {
    const res = await request(app).get('/api/docs/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
  });

  it('documents only routes that actually exist', async () => {
    for (const [path, operations] of Object.entries(openApiDocument.paths)) {
      const methods = Object.keys(operations).filter((key) => ['get', 'post', 'patch', 'put', 'delete'].includes(key));
      for (const method of methods) {
        const res = await (request(app) as unknown as Record<string, (url: string) => request.Test>)[method]!(
          `/api${path}`,
        );
        expect(res.status, `${method.toUpperCase()} /api${path}`).not.toBe(404);
      }
    }
  });
});
