import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254, 'Email is too long'));

export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    // bcrypt only uses the first 72 bytes; reject longer input instead of silently truncating.
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes')
    .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), 'Password must contain a letter and a number'),
  displayName: z.string().trim().min(1, 'Display name is required').max(80, 'Display name is too long'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
