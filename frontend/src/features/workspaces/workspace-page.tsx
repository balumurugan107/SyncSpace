import { PresenceBadge } from '@/features/realtime/presence-badge';
import { Building2, FolderKanban, History, ListTodo, Plus, Settings, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { CollectionSummary } from '@/components/page-primitives';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateProjectDialog } from '@/features/projects/create-project-dialog';
import { ProjectCard } from '@/features/projects/project-card';
import { errorMessage, useActivity, useWorkspace, useWorkspaceProjects } from '@/features/work/api';
import { ActivityFeed } from '@/features/work/activity-feed';
import { RoleBadge } from '@/features/work/task-meta';
import type { Workspace } from '@/features/work/types';
import { MembersPanel } from './members-panel';
import { WorkspaceSettings } from './workspace-settings';

function ProjectsTab({ workspace }: { workspace: Workspace }) {
  const projects = useWorkspaceProjects(workspace.id);
  const canCreate = workspace.role !== 'member';
  const newButton = (
    <Button size="sm">
      <Plus /> New project
    </Button>
  );
  if (projects.isPending) return <Skeleton className="h-40" />;
  if (projects.isError) return <p className="text-sm text-destructive">{errorMessage(projects.error)}</p>;
  return (
    <div className="space-y-4">
      {canCreate && projects.data.length > 0 && <div className="flex justify-end"><CreateProjectDialog trigger={newButton} workspaces={[workspace]} /></div>}
      {projects.data.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <FolderKanban className="size-6 text-muted-foreground" />
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canCreate ? 'Create a project to get a Kanban board.' : 'An owner or admin can create the first project.'}
            </p>
          </div>
          {canCreate && <CreateProjectDialog trigger={newButton} workspaces={[workspace]} />}
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      )}
    </div>
  );
}

function ActivityTab({ workspaceId }: { workspaceId: string }) {
  const activity = useActivity('workspaces', workspaceId, 50);
  return (
    <Card>
      <CardContent>
        <ActivityFeed entries={activity.data} loading={activity.isPending} showContext />
      </CardContent>
    </Card>
  );
}

export function WorkspacePage() {
  const { workspaceId = '' } = useParams();
  const workspace = useWorkspace(workspaceId);

  if (workspace.isPending) return <Skeleton className="mx-auto h-64 max-w-6xl" />;
  if (workspace.isError) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(workspace.error)}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to="/workspaces">Back to workspaces</Link>
        </Button>
      </div>
    );
  }
  const ws = workspace.data;

  return (
    <div className="page-content">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/workspaces" className="hover:text-foreground">Workspaces</Link> / <span className="text-foreground">{ws.name}</span>
      </nav>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-5 sm:p-7">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="collection-mark"><Building2 className="size-5" /></span><h1 className="max-w-full break-words text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{ws.name}</h1>
            <RoleBadge role={ws.role} />
            <PresenceBadge workspaceId={ws.id} />
          </div>
          {ws.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{ws.description}</p>}
        </div>
      </div>

      <CollectionSummary items={[{ label: 'Projects', value: ws.projectCount, icon: FolderKanban }, { label: 'Team members', value: ws.memberCount, icon: Users }, { label: 'Open tasks', value: ws.openTaskCount, icon: ListTodo }]} />
      <Tabs defaultValue="projects">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="projects"><FolderKanban /> Projects</TabsTrigger>
          <TabsTrigger value="members"><Users /> Members <span className="text-xs text-muted-foreground">{ws.memberCount}</span></TabsTrigger>
          <TabsTrigger value="activity"><History /> Activity</TabsTrigger>
          {ws.role !== 'member' && <TabsTrigger value="settings"><Settings /> Settings</TabsTrigger>}
        </TabsList>
        <TabsContent value="projects"><ProjectsTab workspace={ws} /></TabsContent>
        <TabsContent value="members"><MembersPanel workspace={ws} /></TabsContent>
        <TabsContent value="activity"><ActivityTab workspaceId={ws.id} /></TabsContent>
        {ws.role !== 'member' && (
          <TabsContent value="settings">
            <WorkspaceSettings key={ws.updatedAt} workspace={ws} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
