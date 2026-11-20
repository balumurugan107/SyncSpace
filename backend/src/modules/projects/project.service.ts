import { cache, type Cached } from '../../infrastructure/cache/cache.js';
import { withTransaction, type Queryable } from '../../infrastructure/database/pool.js';
import { afterCommit } from '../../shared/after-commit.js';
import { Errors } from '../../shared/errors/app-error.js';
import { activityRepository } from '../activity/activity.repository.js';
import { requireWorkspaceRole, type WorkspaceRole } from '../workspaces/workspace-access.js';
import { projectRepository, type ProjectRecord, type ProjectSummary } from './project.repository.js';
import type { CreateProjectInput, UpdateProjectInput } from './project.schemas.js';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Resolves a project and checks the caller's role in its workspace. Unknown
 * projects and projects in other people's workspaces both answer 404.
 */
export async function requireProjectAccess(
  projectId: string,
  userId: string,
  minimum: WorkspaceRole = 'member',
  db?: Queryable,
): Promise<{ project: ProjectRecord; role: WorkspaceRole }> {
  const project = await projectRepository.findById(projectId, db);
  if (!project) throw Errors.notFound('Project not found');
  try {
    const role = await requireWorkspaceRole(project.workspaceId, userId, minimum, db);
    return { project, role };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) throw Errors.notFound('Project not found');
    throw error;
  }
}

async function loadSummary(projectId: string, userId: string): Promise<ProjectSummary> {
  const project = await projectRepository.findSummaryForUser(projectId, userId);
  if (!project) throw Errors.notFound('Project not found');
  return project;
}

export const projectService = {
  listForUser: (userId: string) => projectRepository.listForUser(userId),

  async listForWorkspace(workspaceId: string, userId: string): Promise<ProjectSummary[]> {
    await requireWorkspaceRole(workspaceId, userId);
    return projectRepository.listForWorkspace(workspaceId, userId);
  },

  /**
   * Project header + task counts. The cached part is the same for every member; the
   * caller's role is checked live and merged in (permissions are never cached).
   */
  async get(projectId: string, userId: string): Promise<Cached<ProjectSummary>> {
    const { project, role } = await requireProjectAccess(projectId, userId);
    const cached = await cache.read(`project:${projectId}`, [`project:${projectId}`, `workspace:${project.workspaceId}`], () =>
      loadSummary(projectId, userId),
    );
    return { status: cached.status, value: { ...cached.value, role } };
  },

  async create(workspaceId: string, userId: string, input: CreateProjectInput): Promise<ProjectSummary> {
    try {
      const { id } = await withTransaction(async (tx) => {
        await requireWorkspaceRole(workspaceId, userId, 'admin', tx);
        const project = await projectRepository.insert({ workspaceId, ...input, createdBy: userId }, tx);
        await activityRepository.record(
          {
            workspaceId,
            projectId: project.id,
            actorId: userId,
            action: 'project.created',
            entityTitle: input.name,
            metadata: { key: input.key },
          },
          tx,
        );
        return project;
      });
      await afterCommit({ type: 'project.created', workspaceId, projectId: id, actorId: userId, scopes: [`workspace:${workspaceId}`] });
      return loadSummary(id, userId);
    } catch (error) {
      if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw Errors.conflict(`Another project in this workspace already uses the key ${input.key}`, 'PROJECT_KEY_TAKEN');
      }
      throw error;
    }
  },

  async update(projectId: string, userId: string, input: UpdateProjectInput): Promise<ProjectSummary> {
    const workspaceId = await withTransaction(async (tx) => {
      const { project } = await requireProjectAccess(projectId, userId, 'admin', tx);
      await projectRepository.update(projectId, input, tx);
      await activityRepository.record(
        {
          workspaceId: project.workspaceId,
          projectId,
          actorId: userId,
          action: 'project.updated',
          entityTitle: input.name ?? project.name,
          metadata: { fields: Object.keys(input) },
        },
        tx,
      );
      return project.workspaceId;
    });
    await afterCommit({ type: 'project.updated', workspaceId, projectId, actorId: userId, scopes: [`project:${projectId}`] });
    return loadSummary(projectId, userId);
  },

  async delete(projectId: string, userId: string): Promise<void> {
    const workspaceId = await withTransaction(async (tx) => {
      const { project } = await requireProjectAccess(projectId, userId, 'admin', tx);
      await projectRepository.delete(projectId, tx);
      // project_id stays NULL: the project's own history is deleted with it, but the
      // workspace keeps a record that it existed.
      await activityRepository.record(
        {
          workspaceId: project.workspaceId,
          actorId: userId,
          action: 'project.deleted',
          entityTitle: project.name,
          metadata: { key: project.key },
        },
        tx,
      );
      return project.workspaceId;
    });
    await afterCommit({ type: 'project.deleted', workspaceId, projectId, actorId: userId, scopes: [`project:${projectId}`] });
  },
};
