import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Info, MousePointerClick, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { CURRENT_PHASE } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/theme-provider';
import { COMPONENTS, CONNECTIONS, FLOWS, componentById, isImplemented, type ArchFlow } from './architecture-data';
import { ComponentNode, type ComponentNodeType, type HighlightState } from './component-node';
import { ExplainPanel } from './explain-panel';
import { FlowEdge, type FlowEdgeType } from './flow-edge';
import { useFlowPlayer } from './use-flow-player';

const nodeTypes: NodeTypes = { component: ComponentNode };
const edgeTypes: EdgeTypes = { flow: FlowEdge };

function highlightFor(id: string, flow: ArchFlow | undefined, current: Set<string>, inFlow: Set<string>): HighlightState {
  if (!flow) return 'idle';
  if (current.has(id)) return 'active';
  if (inFlow.has(id)) return 'inFlow';
  return 'dimmed';
}

/** Keep the overview fitted when the available screen size changes, not on data updates. */
function FitOnResize() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      // Let React Flow's size observer update before calculating the viewport.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => void fitView({ padding: 0.08, maxZoom: 1.1 }));
      });
    };
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(frame); };
  }, [fitView]);
  return null;
}

export function ArchitecturePage() {
  const { resolvedTheme } = useTheme();
  const [showPlanned, setShowPlanned] = useState(false);
  const [flowId, setFlowId] = useState<string | null>('auth');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flow = FLOWS.find((f) => f.id === flowId && (showPlanned || isImplemented(f)));
  const player = useFlowPlayer(flow);
  const selected = selectedId ? componentById(selectedId) : undefined;

  const { nodes, edges } = useMemo(() => {
    const step = player.step;
    const flowNodeIds = new Set(flow?.steps.flatMap((s) => s.nodes) ?? []);
    const flowEdgeIds = new Set(flow?.steps.flatMap((s) => s.edges.map((e) => e.id)) ?? []);
    const stepNodeIds = new Set(step?.nodes ?? []);
    const stepEdges = new Map((step?.edges ?? []).map((e) => [e.id, Boolean(e.reverse)]));
    const stepEdgeIds = new Set(stepEdges.keys());
    const arrowColor = resolvedTheme === 'dark' ? '#9ca3af' : '#71717a';

    const visibleComponents = COMPONENTS.filter((c) => showPlanned || isImplemented(c));
    const visibleIds = new Set(visibleComponents.map((c) => c.id));

    const nodes: ComponentNodeType[] = visibleComponents.map((component) => ({
      id: component.id,
      type: 'component',
      position: component.position,
      data: {
        component,
        planned: !isImplemented(component),
        highlight: highlightFor(component.id, flow, stepNodeIds, flowNodeIds),
        selected: component.id === selectedId,
      },
    }));

    const edges: FlowEdgeType[] = CONNECTIONS.filter(
      (c) => (showPlanned || isImplemented(c)) && visibleIds.has(c.source) && visibleIds.has(c.target),
    ).map((connection) => {
      const highlight = highlightFor(connection.id, flow, stepEdgeIds, flowEdgeIds);
      return {
        id: connection.id,
        type: 'flow',
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceSide,
        targetHandle: connection.targetSide,
        zIndex: highlight === 'active' ? 10 : 0,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: highlight === 'active' ? '#2563eb' : arrowColor },
        data: {
          label: connection.label,
          planned: !isImplemented(connection),
          highlight,
          reverse: stepEdges.get(connection.id) ?? false,
        },
      };
    });

    return { nodes, edges };
  }, [flow, player.step, selectedId, showPlanned, resolvedTheme]);

  function togglePlanned() {
    const next = !showPlanned;
    setShowPlanned(next);
    if (!next) {
      if (selected && !isImplemented(selected)) setSelectedId(null);
      const current = FLOWS.find((f) => f.id === flowId);
      if (current && !isImplemented(current)) setFlowId('auth');
    }
  }

  const implementedCount = COMPONENTS.filter(isImplemented).length;

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Under the surface"
        title="Architecture Explorer"
        description={`The live architecture of this build (Phase ${CURRENT_PHASE}). ${implementedCount} components are running; pick a flow to watch a request travel through them, or click any component to learn what it does.`}
        actions={
          <Button variant={showPlanned ? 'secondary' : 'outline'} size="sm" onClick={togglePlanned} aria-pressed={showPlanned}>
            <span className={cn('size-2 rounded-full border border-dashed border-muted-foreground', showPlanned && 'border-solid bg-primary')} />
            {showPlanned ? 'Hide planned components' : 'Show planned components'}
          </Button>
        }
      />

      <div className="surface-toolbar mb-5" role="tablist" aria-label="Architecture flows">
        {FLOWS.map((f) => {
          const available = isImplemented(f);
          const disabled = !available && !showPlanned;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={flowId === f.id && Boolean(flow)}
              disabled={disabled}
              title={disabled ? `Ships in Phase ${f.phase}. Turn on "Show planned components" to preview the design.` : f.summary}
              onClick={() => setFlowId(flowId === f.id ? null : f.id)}
              className={cn(
                'flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                flowId === f.id && flow ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                !available && 'border-dashed',
                disabled && 'cursor-not-allowed opacity-50 hover:bg-card',
              )}
            >
              {f.name}
              {!available && <span className="text-[10px] opacity-80">Phase {f.phase}</span>}
            </button>
          );
        })}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="relative h-[440px] overflow-hidden bg-card sm:h-[560px]">
          <ReactFlow
            key={showPlanned ? 'all' : 'implemented'}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={resolvedTheme}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 1.1 }}
            minZoom={0.12}
            maxZoom={1.6}
          >
            <FitOnResize />
            <Background gap={20} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>

          {/* Explain-this-component slide-over, inside the canvas so the diagram keeps its full width. */}
          <div
            className={cn(
              'absolute inset-y-0 right-0 z-10 w-full max-w-[420px] border-l bg-card shadow-xl transition-transform duration-300',
              selected ? 'translate-x-0' : 'pointer-events-none translate-x-full',
            )}
            aria-hidden={!selected}
          >
            {selected && (
              <ExplainPanel component={selected} showPlanned={showPlanned} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
            )}
          </div>
        </div>

        <div className="grid min-w-0 border-t bg-muted/25 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 p-4 sm:p-5">
            {flow && player.step ? (
              <>
                {!isImplemented(flow) && (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-dashed bg-card px-3 py-2 text-xs text-muted-foreground">
                    <Info className="size-3.5" /> Planned design for Phase {flow.phase}. None of this runs yet.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="size-8" onClick={player.previous} disabled={player.stepIndex === 0} aria-label="Previous step">
                      <SkipBack />
                    </Button>
                    <Button size="icon" className="size-8" onClick={player.togglePlay} aria-label={player.playing ? 'Pause' : 'Play'}>
                      {player.playing ? <Pause /> : <Play />}
                    </Button>
                    <Button variant="outline" size="icon" className="size-8" onClick={player.next} disabled={player.stepIndex >= player.total - 1} aria-label="Next step">
                      <SkipForward />
                    </Button>
                  </div>
                  <div className="flex flex-1 items-center gap-1">
                    {flow.steps.map((s, index) => (
                      <button
                        key={s.title}
                        type="button"
                        onClick={() => player.goTo(index)}
                        className={cn('h-1.5 flex-1 rounded-full transition-colors', index <= player.stepIndex ? 'bg-primary' : 'bg-border')}
                        aria-label={`Step ${index + 1}: ${s.title}`}
                        aria-current={index === player.stepIndex ? 'step' : undefined}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {player.stepIndex + 1} / {player.total}
                  </span>
                </div>
                <div className="mt-4" aria-live="polite">
                  <p className="text-xs font-medium text-primary">{flow.name}</p>
                  <h3 className="mt-0.5 font-semibold">{player.step.title}</h3>
                  <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{player.step.detail}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a flow above to animate how a request travels through the system.</p>
            )}
          </div>

          {flow && (
            <div className="min-w-0 border-t p-4 sm:p-5 xl:border-t-0 xl:border-l">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">All steps</h3>
              <ol className="mt-2 space-y-0.5">
                {flow.steps.map((s, index) => (
                  <li key={s.title}>
                    <button
                      type="button"
                      onClick={() => player.goTo(index)}
                      className={cn(
                        'flex w-full gap-2.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-muted',
                        index === player.stepIndex && 'bg-primary/10 text-primary',
                      )}
                    >
                      <span className="w-4 shrink-0 text-right text-xs leading-5 text-muted-foreground tabular-nums">{index + 1}</span>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MousePointerClick className="size-4 text-primary" /> Explain a component
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Click a box in the diagram, or pick one here, to see what it is, why SyncSpace uses it, what data flows through it and what happens when it fails.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {COMPONENTS.filter((c) => showPlanned || isImplemented(c)).map((c) => (
                <Button
                  key={c.id}
                  variant={selectedId === c.id ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(!isImplemented(c) && 'border-dashed text-muted-foreground')}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Legend</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-4 w-6 rounded border bg-card" /> Running in this build (Phase {CURRENT_PHASE})
              </li>
              <li className="flex items-center gap-2">
                <span className="h-4 w-6 rounded border border-dashed" /> Planned, shown only when enabled
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-primary" /> A request or event in motion
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
