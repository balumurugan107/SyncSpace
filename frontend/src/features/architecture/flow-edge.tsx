import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { HighlightState } from './component-node';

export type FlowEdgeData = {
  label: string;
  planned: boolean;
  highlight: HighlightState;
  reverse: boolean;
};

export type FlowEdgeType = Edge<FlowEdgeData, 'flow'>;

/**
 * Smooth-step edge that, when active, animates a "packet" travelling along the path.
 * `reverse` sends the packet target -> source (e.g. a response going back).
 */
function FlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<FlowEdgeType>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const highlight = data?.highlight ?? 'idle';
  const active = highlight === 'active';

  const stroke = active ? 'var(--primary)' : highlight === 'inFlow' ? 'color-mix(in oklch, var(--primary) 55%, transparent)' : 'var(--muted-foreground)';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd ? { markerEnd } : {})}
        style={{
          stroke,
          strokeWidth: active ? 2.5 : 1.5,
          strokeDasharray: data?.planned ? '6 5' : undefined,
          opacity: highlight === 'dimmed' ? 0.2 : data?.planned ? 0.5 : 0.85,
          transition: 'stroke 300ms, opacity 300ms',
        }}
      />
      {active && (
        <circle r={5} fill="var(--primary)" style={{ filter: 'drop-shadow(0 0 4px var(--primary))' }}>
          <animateMotion
            dur="1.4s"
            repeatCount="indefinite"
            path={path}
            keyPoints={data?.reverse ? '1;0' : '0;1'}
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      )}
      <EdgeLabelRenderer>
        <div
          className={cn(
            'nodrag nopan pointer-events-none absolute rounded-md border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground transition-opacity',
            active && 'border-primary/60 text-primary',
            highlight === 'dimmed' && 'opacity-30',
            data?.planned && 'border-dashed opacity-70',
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const FlowEdge = memo(FlowEdgeView);
