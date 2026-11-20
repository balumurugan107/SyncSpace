import { describe, expect, it } from 'vitest';
import { CURRENT_PHASE } from '@/components/layout/navigation';
import { COMPONENTS, CONNECTIONS, FLOWS, isImplemented, neighboursOf } from './architecture-data';

const componentIds = new Set(COMPONENTS.map((c) => c.id));
const connectionsById = new Map(CONNECTIONS.map((c) => [c.id, c]));
const componentsById = new Map(COMPONENTS.map((c) => [c.id, c]));

describe('architecture data integrity', () => {
  it('has unique ids', () => {
    expect(componentIds.size).toBe(COMPONENTS.length);
    expect(connectionsById.size).toBe(CONNECTIONS.length);
    expect(new Set(FLOWS.map((f) => f.id)).size).toBe(FLOWS.length);
  });

  it('connections reference existing components', () => {
    for (const c of CONNECTIONS) {
      expect(componentIds.has(c.source), `${c.id} source`).toBe(true);
      expect(componentIds.has(c.target), `${c.id} target`).toBe(true);
    }
  });

  it('a connection cannot ship before both of its endpoints', () => {
    for (const c of CONNECTIONS) {
      const latest = Math.max(componentsById.get(c.source)!.phase, componentsById.get(c.target)!.phase);
      expect(c.phase, c.id).toBeGreaterThanOrEqual(latest);
    }
  });

  it('flow steps reference existing components and connections', () => {
    for (const flow of FLOWS) {
      for (const step of flow.steps) {
        for (const node of step.nodes) expect(componentIds.has(node), `${flow.id}: ${node}`).toBe(true);
        for (const edge of step.edges) expect(connectionsById.has(edge.id), `${flow.id}: ${edge.id}`).toBe(true);
      }
    }
  });

  it('implemented flows only travel through implemented components and connections', () => {
    for (const flow of FLOWS.filter(isImplemented)) {
      for (const step of flow.steps) {
        for (const node of step.nodes) {
          expect(isImplemented(componentsById.get(node)!), `${flow.id} uses planned component ${node}`).toBe(true);
        }
        for (const edge of step.edges) {
          expect(isImplemented(connectionsById.get(edge.id)!), `${flow.id} uses planned connection ${edge.id}`).toBe(true);
        }
      }
    }
  });

  it('every implemented component is reachable from the browser or is a job that feeds the database', () => {
    for (const component of COMPONENTS.filter(isImplemented)) {
      expect(neighboursOf(component.id, false).length, component.id).toBeGreaterThan(0);
    }
  });

  it(`Phase ${CURRENT_PHASE} runs exactly the expected components`, () => {
    // Update this list when a phase ships, together with docker-compose.yml.
    const phase1 = ['browser', 'web', 'api', 'postgres', 'migrate'];
    // Phase 2 adds business modules only: no new infrastructure components.
    const expected: Record<number, string[]> = { 1: phase1, 2: phase1, 3: [...phase1, 'redis'], 4: [...phase1, 'redis', 'socket'] };
    if (expected[CURRENT_PHASE]) {
      expect(COMPONENTS.filter(isImplemented).map((c) => c.id).sort()).toEqual([...expected[CURRENT_PHASE]].sort());
    }
  });

  it('every component answers all explain-panel questions', () => {
    for (const c of COMPONENTS) {
      expect(c.what && c.why && c.failure, c.id).toBeTruthy();
      expect(c.receives.length && c.sends.length && c.features.length && c.alternatives.length, c.id).toBeTruthy();
    }
  });
});
