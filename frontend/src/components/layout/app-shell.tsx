import { ChevronRight, Menu } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NAV_ITEMS } from './navigation';
import { Sidebar } from './sidebar';
import { ThemeToggle, UserMenu } from './user-menu';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const current = NAV_ITEMS.find((item) => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to));
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-svh">
      <a href="#main-content" className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus:translate-y-0">Skip to content</a>
      <aside className="sticky top-0 hidden h-svh w-[244px] shrink-0 border-r border-sidebar-border bg-sidebar lg:block"><Sidebar /></aside>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); navigationTrigger.current?.focus(); }} side="left" className="max-w-[290px] border-sidebar-border bg-sidebar p-0 text-slate-100 lg:hidden">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Navigate your workspaces, projects and account.</DialogDescription>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-7 lg:px-9">
          <Button ref={navigationTrigger} variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}><Menu /></Button>
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <Link to="/" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">Workspace</Link>
            <ChevronRight className="hidden size-3 text-muted-foreground/60 sm:block" aria-hidden="true" />
            <span className="truncate font-medium">{current?.label ?? 'Overview'}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
            <time className="hidden pr-3 text-xs text-muted-foreground xl:block" dateTime={new Date().toISOString().slice(0, 10)}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time>
            <ThemeToggle />
            <span className="mx-1 h-5 w-px bg-border" />
            <UserMenu />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-7 outline-none sm:px-7 sm:py-8 lg:px-9"><div key={location.pathname} className="page-arrive"><Outlet /></div></main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">{eyebrow && <p className="page-eyebrow">{eyebrow}</p>}<h1 className="break-words text-[28px] leading-tight font-semibold tracking-[-0.035em] sm:text-[32px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{description}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
