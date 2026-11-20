import { CheckCircle2, FolderKanban, Layers3, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { CollectionSummary } from '@/components/page-primitives';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, useProjects, useWorkspaces } from '@/features/work/api';
import { CreateProjectDialog } from './create-project-dialog';
import { ProjectCard } from './project-card';

export function ProjectsPage() {
  const projects = useProjects();
  const workspaces = useWorkspaces();
  const manageable = workspaces.data?.filter((w) => w.role !== 'member') ?? [];

  const grouped = new Map<string, { name: string; projects: NonNullable<typeof projects.data> }>();
  for (const project of projects.data ?? []) {
    const group = grouped.get(project.workspaceId) ?? { name: project.workspaceName, projects: [] };
    group.projects.push(project);
    grouped.set(project.workspaceId, group);
  }

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="From ideas to outcomes"
        title="Projects"
        description="The big picture, one project at a time. Find a board and keep things moving."
        actions={
          manageable.length > 0 && (
            <CreateProjectDialog
              workspaces={manageable}
              trigger={
                <Button>
                  <Plus /> New project
                </Button>
              }
            />
          )
        }
      />
      {projects.data && <CollectionSummary items={[{ label: 'Projects', value: projects.data.length, icon: FolderKanban }, { label: 'Workspaces', value: grouped.size, icon: Layers3 }, { label: 'Completed tasks', value: projects.data.reduce((sum, project) => sum + project.taskCounts.COMPLETED, 0), icon: CheckCircle2 }]} />}
      {projects.isPending ? (
        <Skeleton className="h-48" />
      ) : projects.isError ? (
        <p className="text-sm text-destructive">{errorMessage(projects.error)}</p>
      ) : grouped.size === 0 ? (
        <Card className="items-center border-dashed px-6 py-20 text-center">
          <FolderKanban className="size-6 text-muted-foreground" />
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {workspaces.data?.length ? 'Create a project in one of your workspaces.' : 'Create a workspace first, then add projects to it.'}
            </p>
          </div>
          {!workspaces.data?.length && (
            <Button asChild variant="outline">
              <Link to="/workspaces">Go to workspaces</Link>
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([workspaceId, group]) => (
            <section key={workspaceId}>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Link to={`/workspaces/${workspaceId}`} className="hover:underline">{group.name}</Link>
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {group.projects.map((project) => <ProjectCard key={project.id} project={project} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
