import type { ReactNode } from 'react';
import { ArrowUpRight, Check, Layers3, MessageCircle, MousePointer2 } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/user-menu';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.05fr]">
      <a href="#auth-content" className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground focus:translate-y-0">Skip to account form</a>
      <div className="flex flex-col bg-card px-6 py-7 sm:px-12 lg:px-14">
        <div className="flex items-center justify-between"><Logo /><ThemeToggle /></div>
        <main id="auth-content" tabIndex={-1} className="flex flex-1 items-center justify-center py-12 outline-none"><div className="page-arrive w-full max-w-[360px]"><p className="page-eyebrow">Your team, in sync</p><h1 className="text-[32px] font-semibold tracking-[-0.04em]">{title}</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p><div className="mt-8">{children}</div></div></main>
        <p className="text-[11px] text-muted-foreground">SyncSpace · A shared space for work that matters.</p>
      </div>
      <aside className="relative hidden flex-col justify-center overflow-hidden bg-[#152238] px-12 py-14 text-white lg:flex xl:px-20">
        <div className="absolute -top-20 -right-20 size-96 rounded-full border border-white/5" /><div className="absolute -right-8 -bottom-48 size-[520px] rounded-full border border-white/5" />
        <div className="relative mx-auto w-full max-w-lg"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-blue-200"><span className="size-1.5 rounded-full bg-blue-300" /> Built for working together</div><p className="max-w-md text-[44px] leading-[1.1] font-medium tracking-[-0.045em]">Less scattered.<br /><span className="text-blue-300">More together.</span></p><p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">Projects, conversations and the next thing to do. Give your team one place to move work forward.</p>
          <div className="mt-12 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] shadow-2xl" aria-label="SyncSpace features">
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><Layers3 className="size-4 text-blue-300" /><span className="text-xs font-medium">One connected workspace</span><ArrowUpRight className="ml-auto size-4 text-slate-500" /></div>
            <div className="space-y-4 p-5">{[{ icon: Check, title: 'Keep projects moving', detail: 'Tasks, priorities and a shared Kanban board.' }, { icon: MessageCircle, title: 'Keep the conversation close', detail: 'Workspace chat and live team presence.' }, { icon: MousePointer2, title: 'See changes as they happen', detail: 'Live updates across your team’s screens.' }].map(({ icon: Icon, title: label, detail }) => <div key={label} className="flex items-start gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-300"><Icon className="size-4" /></span><div><p className="text-[13px] font-medium">{label}</p><p className="mt-1 text-xs leading-5 text-slate-300">{detail}</p></div></div>)}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
