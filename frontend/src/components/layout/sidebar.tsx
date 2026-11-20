import { ArrowUpRight, ChevronDown, Layers3, Plus, Radio } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useWorkspaces } from '@/features/work/api';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { CURRENT_PHASE, NAV_ITEMS, isAvailable, type NavItem } from './navigation';

function SidebarItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  if (!isAvailable(item)) return (
    <div className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] text-slate-400" title={`${item.label} arrives in Phase ${item.phase}`} aria-disabled="true"><Icon className="size-[18px]" /><span className="flex-1">{item.label}</span><span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px]">Phase {item.phase}</span></div>
  );
  return <NavLink to={item.to} end={item.to === '/'} onClick={onNavigate} className={({ isActive }) => cn('group flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400', isActive ? 'border-white/10 bg-white/10 text-white shadow-xs' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')}><Icon className="size-[18px] shrink-0" />{item.label}</NavLink>;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const workspaces = useWorkspaces();
  const location = useLocation();
  const selected = workspaces.data?.find((workspace) => location.pathname.includes(workspace.id));
  const groups: { key: NavItem['group']; label: string }[] = [{ key: 'collaborate', label: 'Your workspace' }, { key: 'system', label: 'Tools & insights' }];
  return (
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-4 py-7 text-slate-100">
      <div className="px-3"><Logo /><p className="mt-2 pl-[38px] text-[10px] tracking-wide text-slate-400">A little more in sync.</p></div>
      <DropdownMenu><DropdownMenuTrigger className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="Switch workspace"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-400/15 text-blue-300"><Layers3 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{selected?.name ?? 'All workspaces'}</span><span className="mt-0.5 block text-[10px] text-slate-400">{workspaces.data?.length ?? 0} workspaces</span></span><ChevronDown className="size-3 text-slate-400" /></DropdownMenuTrigger><DropdownMenuContent className="w-56" align="start"><DropdownMenuLabel>Switch workspace</DropdownMenuLabel>{workspaces.data?.map((workspace) => <DropdownMenuItem asChild key={workspace.id}><Link to={`/workspaces/${workspace.id}`} onClick={onNavigate}><Layers3 /> <span className="truncate">{workspace.name}</span></Link></DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/workspaces" onClick={onNavigate}><Plus /> View workspaces</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <nav className="flex flex-1 flex-col gap-7" aria-label="Main">{groups.map((group) => <div key={group.key} className="space-y-1"><p className="mb-3 px-3 text-[10px] font-medium tracking-[0.12em] text-slate-400 uppercase">{group.label}</p>{NAV_ITEMS.filter((item) => item.group === group.key).map((item) => <SidebarItem key={item.to} item={item} {...(onNavigate ? { onNavigate } : {})} />)}</div>)}</nav>
      <Link to="/architecture" onClick={onNavigate} className="rounded-xl border border-white/10 bg-white/[0.025] p-4 transition-colors hover:bg-white/5"><span className="flex items-center gap-2 text-xs font-medium"><Radio className="size-3.5 text-blue-300" /> Inside SyncSpace <ArrowUpRight className="ml-auto size-3.5 text-slate-400" /></span><span className="mt-2 block text-[11px] leading-relaxed text-slate-400">See how your work stays connected.</span><span className="mt-3 block text-[10px] text-slate-400">Build phase {CURRENT_PHASE} of 11</span></Link>
    </div>
  );
}
