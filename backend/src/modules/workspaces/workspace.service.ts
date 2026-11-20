import { cache, type Cached } from '../../infrastructure/cache/cache.js';
import { withTransaction } from '../../infrastructure/database/pool.js';
import { afterCommit } from '../../shared/after-commit.js';
import { AppError, Errors } from '../../shared/errors/app-error.js';
import { activityRepository } from '../activity/activity.repository.js';
import { userRepository } from '../users/user.repository.js';
import { requireWorkspaceRole } from './workspace-access.js';
import { workspaceRepository, type WorkspaceMember, type WorkspaceSummary } from './workspace.repository.js';
import type { AddMemberInput, CreateWorkspaceInput, UpdateMemberInput, UpdateWorkspaceInput } from './workspace.schemas.js';

async function loadSummary(workspaceId: string, userId: string): Promise<WorkspaceSummary> {
  const workspace = await workspaceRepository.findForUser(workspaceId, userId);
  if (!workspace) throw Errors.notFound('Workspace not found');
  return workspace;
}

/**
 * Membership rules:
 * - owner: everything, including deleting the workspace. Cannot leave or be demoted.
 * - admin: rename, manage members (add/remove/role) and projects.
 * - member: read everything, create and edit tasks, leave.
 */
export const workspaceService = {
  list: (userId: string) => workspaceRepository.listForUser(userId),

  get: (workspaceId: string, userId: string) => loadSummary(workspaceId, userId),

  async create(userId: string, input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
    const { id } = await withTransaction(async (tx) => {
      const workspace = await workspaceRepository.insert({ ...input, createdBy: userId }, tx);
      await workspaceRepository.addMember(workspace.id, userId, 'owner', tx);
      await activityRepository.record(
        { workspaceId: workspace.id, actorId: userId, action: 'workspace.created', entityTitle: input.name },
        tx,
      );
      return workspace;
    });
    await afterCommit({ type: 'workspace.created', workspaceId: id, actorId: userId, scopes: [] });
    return loadSummary(id, userId);
  },

  async update(workspaceId: string, userId: string, input: UpdateWorkspaceInput): Promise<WorkspaceSummary> {
    await withTransaction(async (tx) => {
      await requireWorkspaceRole(workspaceId, userId, 'admin', tx);
      await workspaceRepository.update(workspaceId, input, tx);
      const current = await workspaceRepository.findForUser(workspaceId, userId, tx);
      await activityRepository.record(
        {
          workspaceId,
          actorId: userId,
          action: 'workspace.updated',
          entityTitle: current?.name ?? '',
          metadata: { fields: Object.keys(input) },
        },
        tx,
      );
    });
    await afterCommit({ type: 'workspace.updated', workspaceId, actorId: userId, scopes: [`workspace:${workspaceId}`] });
    return loadSummary(workspaceId, userId);
  },

  async delete(workspaceId: string, userId: string): Promise<void> {
    await requireWorkspaceRole(workspaceId, userId, 'owner');
    await workspaceRepository.delete(workspaceId);
    await afterCommit({ type: 'workspace.deleted', workspaceId, actorId: userId, scopes: [`workspace:${workspaceId}`] });
  },

  /** Used by every board (assignee picker). Membership itself is checked live. */
  async listMembers(workspaceId: string, userId: string): Promise<Cached<WorkspaceMember[]>> {
    await requireWorkspaceRole(workspaceId, userId);
    return cache.read(`members:${workspaceId}`, [`workspace:${workspaceId}`, 'users'], () =>
      workspaceRepository.listMembers(workspaceId),
    );
  },

  /**
   * Adds an existing SyncSpace user by email. (Email invitations for people without
   * an account need an email sender, which arrives with background jobs in Phase 5.)
   */
  async addMember(workspaceId: string, userId: string, input: AddMemberInput): Promise<WorkspaceMember> {
    const invitee = await userRepository.findByEmail(input.email);
    const member = await withTransaction(async (tx) => {
      await requireWorkspaceRole(workspaceId, userId, 'admin', tx);
      if (!invitee) {
        throw new AppError(404, 'USER_NOT_FOUND', 'No SyncSpace account uses that email. Ask them to sign up first.');
      }
      if (await workspaceRepository.findMember(workspaceId, invitee.id, tx)) {
        throw Errors.conflict(`${invitee.displayName} is already a member`, 'ALREADY_MEMBER');
      }
      await workspaceRepository.addMember(workspaceId, invitee.id, input.role, tx);
      await activityRepository.record(
        {
          workspaceId,
          actorId: userId,
          action: 'member.added',
          entityTitle: invitee.displayName,
          metadata: { userId: invitee.id, role: input.role },
        },
        tx,
      );
      return (await workspaceRepository.findMember(workspaceId, invitee.id, tx))!;
    });
    await afterCommit({ type: 'member.added', workspaceId, actorId: userId, memberId: invitee!.id, scopes: [`workspace:${workspaceId}`] });
    return member;
  },

  async updateMember(workspaceId: string, actorId: string, targetId: string, input: UpdateMemberInput): Promise<WorkspaceMember> {
    const member = await withTransaction(async (tx) => {
      await requireWorkspaceRole(workspaceId, actorId, 'admin', tx);
      const target = await workspaceRepository.findMember(workspaceId, targetId, tx);
      if (!target) throw Errors.notFound('Member not found');
      if (target.role === 'owner') throw Errors.forbidden('The workspace owner’s role cannot be changed');
      if (target.role !== input.role) {
        await workspaceRepository.setRole(workspaceId, targetId, input.role, tx);
        await activityRepository.record(
          {
            workspaceId,
            actorId,
            action: 'member.role_changed',
            entityTitle: target.displayName,
            metadata: { userId: targetId, from: target.role, to: input.role },
          },
          tx,
        );
      }
      return (await workspaceRepository.findMember(workspaceId, targetId, tx))!;
    });
    await afterCommit({ type: 'member.updated', workspaceId, actorId, memberId: targetId, scopes: [`workspace:${workspaceId}`] });
    return member;
  },

  /** Admins remove others; anyone except the owner may remove themselves (leave). */
  async removeMember(workspaceId: string, actorId: string, targetId: string): Promise<void> {
    await withTransaction(async (tx) => {
      const leaving = actorId === targetId;
      await requireWorkspaceRole(workspaceId, actorId, leaving ? 'member' : 'admin', tx);
      const target = await workspaceRepository.findMember(workspaceId, targetId, tx);
      if (!target) throw Errors.notFound('Member not found');
      if (target.role === 'owner') {
        throw Errors.forbidden(leaving ? 'The owner cannot leave; delete the workspace instead' : 'The owner cannot be removed');
      }
      await workspaceRepository.removeMember(workspaceId, targetId, tx);
      await activityRepository.record(
        {
          workspaceId,
          actorId,
          action: leaving ? 'member.left' : 'member.removed',
          entityTitle: target.displayName,
          metadata: { userId: targetId },
        },
        tx,
      );
    });
    // Workspace scope: member lists AND every board in the workspace (tasks were unassigned).
    await afterCommit({ type: 'member.removed', workspaceId, actorId, memberId: targetId, scopes: [`workspace:${workspaceId}`] });
  },
};
