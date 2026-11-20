import { ArrowUpRight, Building2, FolderKanban, ListTodo, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/app-shell';
import { CollectionSummary, EmptyState } from '@/components/page-primitives';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, useWorkspaces } from '@/features/work/api';
import { RoleBadge } from '@/features/work/task-meta';
import { CreateWorkspaceDialog } from './create-workspace-dialog';

export function WorkspacesPage() {
  const workspaces = useWorkspaces();
  const newButton = <Button><Plus /> New workspace</Button>;
  return (
    <div className="page-content">
      <PageHeader eyebrow="People & places" title="Workspaces" description="A home for every team. Keep projects, people and conversations together." actions={<CreateWorkspaceDialog trigger={newButton} />} />
      {workspaces.isError && <Alert variant="destructive"><AlertDescription>{errorMessage(workspaces.error)}</AlertDescription></Alert>}
      {workspaces.data && <CollectionSummary items={[{ label: 'Your workspaces', value: workspaces.data.length, icon: Building2 }, { label: 'Projects', value: workspaces.data.reduce((sum, workspace) => sum + workspace.projectCount, 0), icon: FolderKanban }, { label: 'Open tasks', value: workspaces.data.reduce((sum, workspace) => sum + workspace.openTaskCount, 0), icon: ListTodo }]} />}
      <div className="section-heading"><h2 className="text-sm font-semibold">All workspaces</h2><span className="section-label">Organized around your teams</span></div>
      {workspaces.isPending ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-64 rounded-2xl" />)}</div> : workspaces.data?.length === 0 ? <EmptyState icon={Building2} title="Your next team starts here" description="Create a workspace for your team, or ask an admin to add you by email." action={<CreateWorkspaceDialog trigger={newButton} />} /> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{workspaces.data?.map((workspace) => <Link key={workspace.id} to={`/workspaces/${workspace.id}`} className="group min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="collection-card"><CardHeader><div className="mb-3 flex items-center justify-between"><span className="collection-mark text-base font-semibold">{workspace.name.slice(0, 2).toUpperCase()}</span><RoleBadge role={workspace.role} /></div><div className="flex items-center justify-between gap-3"><CardTitle className="truncate text-base">{workspace.name}</CardTitle><ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-primary" /></div><CardDescription className="line-clamp-2 min-h-10">{workspace.description || 'Your team’s projects and conversations, in one place.'}</CardDescription></CardHeader><CardContent className="mt-auto"><div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><Users className="size-3.5" /> {workspace.memberCount} members</span><span className="flex items-center gap-1.5"><FolderKanban className="size-3.5" /> {workspace.projectCount} projects</span><span className="flex items-center gap-1.5"><ListTodo className="size-3.5" /> {workspace.openTaskCount} open</span></div></CardContent></Card></Link>)}</div>}
    </div>
  );
}
