import { z } from 'zod';

const name = z.string().trim().min(1, 'Name is required').max(80, 'Name is too long');
const description = z.string().trim().max(500, 'Description is too long');

export const createWorkspaceSchema = z.object({
  name,
  description: description.default(''),
});

export const updateWorkspaceSchema = z
  .object({ name: name.optional(), description: description.optional() })
  .refine((value) => value.name !== undefined || value.description !== undefined, 'Nothing to update');

/** "owner" is never assignable through the API: there is exactly one, the creator. */
const assignableRole = z.enum(['admin', 'member']);

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  role: assignableRole.default('member'),
});

export const updateMemberSchema = z.object({ role: assignableRole });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
