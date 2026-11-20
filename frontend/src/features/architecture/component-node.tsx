import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { isImplemented, type ArchComponent } from './architecture-data';
import { COMPONENT_ICONS } from './icons';

export type HighlightState = 'idle' | 'active' | 'inFlow' | 'dimmed';

export type ComponentNodeData = {
  component: ArchComponent;
  planned: boolean;
  highlight: HighlightState;
  selected: boolean;
};

export type ComponentNodeType = Node<ComponentNodeData, 'component'>;

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

function ComponentNodeView({ data }: NodeProps<ComponentNodeType>) {
  const { component, planned, highlight, selected } = data;
  const Icon = COMPONENT_ICONS[component.icon];
  const replicas = component.replicas && isImplemented(component.replicas) ? component.replicas.count : 1;
  return (
    <div className="relative">
      {/* Replicated components are drawn as a stack: one card per running instance. */}
      {Array.from({ length: replicas - 1 }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={cn('absolute inset-0 rounded-2xl border bg-card shadow-sm transition-opacity', highlight === 'dimmed' && 'opacity-35')}
          style={{ transform: `translate(${(replicas - 1 - i) * 11}px, ${(replicas - 1 - i) * 11}px)` }}
        />
      ))}
    <div
      className={cn(
        // `relative` + later in the DOM: painted above the replica cards behind it.
        'relative w-[190px] cursor-pointer rounded-2xl border bg-card px-3.5 py-3 shadow-sm transition-all duration-300',
        planned && 'border-dashed bg-card/60',
        highlight === 'active' && 'scale-[1.04] border-primary shadow-lg ring-4 ring-primary/25',
        highlight === 'inFlow' && 'border-primary/50',
        highlight === 'dimmed' && 'opacity-35',
        selected && 'ring-2 ring-primary',
      )}
    >
      {SIDES.map((side) => (
        <Handle key={side.id} id={side.id} type="source" position={side.position} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      ))}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            planned ? 'bg-muted text-muted-foreground' : 'bg-primary/12 text-primary',
            highlight === 'active' && 'bg-primary text-primary-foreground',
          )}
        >
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold', planned && 'text-muted-foreground')}>{component.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{component.kind}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        {planned ? (
          <span className="rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground">Planned · Phase {component.phase}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-success">
            <span className="size-1.5 rounded-full bg-success" /> Running{replicas > 1 && ` · ${replicas} instances`}
          </span>
        )}
      </div>
    </div>
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeView);
