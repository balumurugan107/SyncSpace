import dns, { type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The browser only ever talks to this origin. Requests to /api are proxied to the
 * Node.js API, so the refresh-token cookie is first-party and no CORS is needed.
 *
 * Load balancing (Phase 3): Docker's DNS answers the service name "api" with the IP
 * of EVERY replica. This lookup resolves all of them and rotates through the list,
 * and keep-alive is off so each request opens a new connection to the next replica:
 * client-side round-robin via DNS service discovery.
 *
 * Its limits are deliberate teaching points: there are no health checks (a replica
 * that is starting or crashed still receives its share until Docker drops it from
 * DNS) and no "least connections" balancing. Nginx replaces this in Phase 8.
 */
let nextReplica = 0;

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function roundRobinLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dns.resolve4(hostname, (error, addresses) => {
    // Not a DNS name with A records (e.g. "localhost" in local dev): normal lookup.
    if (error || addresses.length === 0) {
      dns.lookup(hostname, { ...options, all: Boolean(options.all) }, callback as never);
      return;
    }
    const sorted = [...addresses].sort();
    const address = sorted[nextReplica++ % sorted.length]!;
    if (options.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  });
}

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
const apiProxy = {
  '/api': {
    target: apiTarget,
    ws: true,
    changeOrigin: false,
    xfwd: true,
    agent: new http.Agent({ keepAlive: false, lookup: roundRobinLookup as never }),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 5173, host: true, proxy: apiProxy },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('socket.io') || id.includes('engine.io')) return 'socket-io';
          if (id.includes('@xyflow')) return 'react-flow';
          if (id.includes('@dnd-kit')) return 'dnd-kit';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
});
