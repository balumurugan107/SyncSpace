import { z } from 'zod';

const name = z.string().trim().min(1, 'Name is required').max(80, 'Name is too long');
const description = z.string().trim().max(1000, 'Description is too long');

export const createProjectSchema = z.object({
  name,
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, 'Key must be 2–6 letters or digits, starting with a letter (e.g. WEB)'),
  description: description.default(''),
});

/** The key is immutable: it is baked into every task id people have already shared (WEB-12). */
export const updateProjectSchema = z
  .object({ name: name.optional(), description: description.optional() })
  .refine((value) => value.name !== undefined || value.description !== undefined, 'Nothing to update');

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
