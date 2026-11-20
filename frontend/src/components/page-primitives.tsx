import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small, real-data summaries shared by collection screens. */
export function CollectionSummary({ items }: { items: { label: string; value: ReactNode; icon: LucideIcon }[] }) {
  return <div className="summary-strip">{items.map(({ label, value, icon: Icon }) => <div key={label} className="summary-cell"><div className="flex items-center justify-between gap-2"><span className="text-[10px] leading-relaxed text-muted-foreground sm:text-xs">{label}</span><Icon className="hidden size-4 shrink-0 text-muted-foreground/70 sm:block" aria-hidden="true" /></div><span className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</span></div>)}</div>;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description: string; action?: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-16 text-center', className)}><span className="collection-mark mb-5 size-14"><Icon className="size-6" aria-hidden="true" /></span><h2 className="text-base font-semibold tracking-tight">{title}</h2><p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>{action && <div className="mt-6">{action}</div>}</div>;
}
