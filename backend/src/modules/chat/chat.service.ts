import { z } from 'zod';
import { pool, withTransaction } from '../../infrastructure/database/pool.js';
import { afterCommit } from '../../shared/after-commit.js';
import { Errors } from '../../shared/errors/app-error.js';
import { requireWorkspaceRole } from '../workspaces/workspace-access.js';

export const sendMessageSchema = z.object({ clientId: z.uuid(), body: z.string().trim().min(1).max(4000) });
export const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  before: z.uuid().optional(),
});
export interface ChatMessage {
  id: string; workspaceId: string; authorId: string | null; authorName: string;
  clientId: string; body: string; createdAt: string;
}
const columns = `m.id, m.workspace_id AS "workspaceId", m.author_id AS "authorId",
  COALESCE(u.display_name, 'Deleted user') AS "authorName", m.client_id AS "clientId",
  m.body, m.created_at AS "createdAt"`;

export const chatService = {
  async list(workspaceId: string, userId: string, input: z.infer<typeof historySchema>) {
    await requireWorkspaceRole(workspaceId, userId);
    const { rows } = await pool.query<ChatMessage>(`
      SELECT ${columns} FROM chat_messages m LEFT JOIN users u ON u.id=m.author_id
      WHERE m.workspace_id=$1 AND ($2::uuid IS NULL OR (m.created_at,m.id) <
        (SELECT created_at,id FROM chat_messages WHERE id=$2 AND workspace_id=$1))
      ORDER BY m.created_at DESC,m.id DESC LIMIT $3`, [workspaceId, input.before ?? null, input.limit + 1]);
    const hasMore = rows.length > input.limit;
    const messages = rows.slice(0, input.limit);
    return { messages, nextCursor: hasMore ? messages.at(-1)!.id : null };
  },
  async send(workspaceId: string, userId: string, input: z.infer<typeof sendMessageSchema>) {
    const result = await withTransaction(async (tx) => {
      await requireWorkspaceRole(workspaceId, userId, 'member', tx);
      const inserted = await tx.query<{ id: string }>(`
        INSERT INTO chat_messages(workspace_id,author_id,client_id,body) VALUES ($1,$2,$3,$4)
        ON CONFLICT (workspace_id,author_id,client_id) DO NOTHING RETURNING id`,
      [workspaceId, userId, input.clientId, input.body]);
      const { rows } = await tx.query<ChatMessage>(`SELECT ${columns} FROM chat_messages m
        LEFT JOIN users u ON u.id=m.author_id WHERE m.workspace_id=$1 AND m.author_id=$2 AND m.client_id=$3`,
      [workspaceId, userId, input.clientId]);
      const message = rows[0]!;
      if (message.body !== input.body) throw Errors.conflict('This send ID was already used for a different message', 'CLIENT_ID_REUSED');
      return { message, inserted: inserted.rowCount === 1 };
    });
    if (result.inserted) await afterCommit({ type: 'chat.message', workspaceId, actorId: userId, scopes: [] });
    return result.message;
  },
};
