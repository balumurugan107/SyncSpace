import { ArrowLeft, ArrowRight, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ArchComponent, isImplemented, neighboursOf } from './architecture-data';
import { COMPONENT_ICONS } from './icons';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-4 marker:text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** "Explain this component": what, why, data in/out, neighbours, a real operation, failure modes, alternatives. */
export function ExplainPanel({
  component,
  showPlanned,
  onSelect,
  onClose,
}: {
  component: ArchComponent;
  showPlanned: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const Icon = COMPONENT_ICONS[component.icon];
  const planned = !isImplemented(component);
  const neighbours = neighboursOf(component.id, showPlanned);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{component.name}</h2>
            {planned ? (
              <Badge variant="outline" className="border-dashed">
                Planned · Phase {component.phase}
              </Badge>
            ) : (
              <Badge variant="success">Implemented</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{component.tagline}</p>
        </div>
        <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-8" onClick={onClose} aria-label="Close explanation">
          <X />
        </Button>
      </div>

      <div className="flex-1 space-y-7 overflow-y-auto p-6">
        {planned && (
          <div className="flex gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            This component is not running yet. Below is the design it will follow when it ships in Phase {component.phase}.
          </div>
        )}
        <Section title="What is it?">{component.what}</Section>
        <Section title="Why SyncSpace uses it">{component.why}</Section>
        <Section title={planned ? 'Features that will depend on it' : 'Features that depend on it'}>
          <BulletList items={component.features} />
        </Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Section title="Receives">
            <BulletList items={component.receives} />
          </Section>
          <Section title="Sends">
            <BulletList items={component.sends} />
          </Section>
        </div>
        <Section title="Talks to">
          {neighbours.length === 0 ? (
            <p className="text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {neighbours.map(({ component: other, connection, direction }) => (
                <li key={connection.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(other.id)}
                    className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    {direction === 'out' ? (
                      <ArrowRight className="size-3.5 text-primary" aria-label="sends to" />
                    ) : (
                      <ArrowLeft className="size-3.5 text-primary" aria-label="receives from" />
                    )}
                    <span className="font-medium">{other.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{connection.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={planned ? 'Example operation (planned)' : 'A real operation'}>
          <p className="mb-2 text-muted-foreground">{component.example.caption}</p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
            <code>{component.example.code}</code>
          </pre>
        </Section>
        <Section title="What happens if it fails?">{component.failure}</Section>
        <Section title="Alternatives & trade-offs">
          <ul className="space-y-2.5">
            {component.alternatives.map((alt) => (
              <li key={alt.name}>
                <p className="font-medium">{alt.name}</p>
                <p className="text-muted-foreground">{alt.tradeoff}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
