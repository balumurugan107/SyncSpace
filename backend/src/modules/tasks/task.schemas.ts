import { z } from 'zod';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const title = z.string().trim().min(1, 'Title is required').max(200, 'Title is too long');
const description = z.string().max(10000, 'Description is too long');
const status = z.enum(TASK_STATUSES);
const priority = z.enum(TASK_PRIORITIES);
const assigneeId = z.uuid('Invalid assignee').nullable();
const dueDate = z.iso.date('Use the format YYYY-MM-DD').nullable();
/** The version the client last saw. Optional for scripts; the web app always sends it. */
const version = z.number().int().positive();

export const createTaskSchema = z.object({
  title,
  description: description.default(''),
  status: status.default('TODO'),
  priority: priority.default('MEDIUM'),
  assigneeId: assigneeId.default(null),
  dueDate: dueDate.default(null),
});

export const updateTaskSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    status: status.optional(),
    priority: priority.optional(),
    assigneeId: assigneeId.optional(),
    dueDate: dueDate.optional(),
    version: version.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), 'Nothing to update');

export const moveTaskSchema = z.object({
  status,
  /** Place the card directly after this task in the target column; null = top of the column. */
  afterTaskId: z.uuid('Invalid task id').nullable(),
  version: version.optional(),
});

export const myTasksQuerySchema = z.object({
  scope: z.enum(['open', 'all']).default('open'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
