import { AlertCircle, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { AuthLayout } from './auth-layout';
import { useAuth } from './auth-provider';
import { FormField } from './form-field';

export function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register(form);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'NETWORK', 'Could not reach the server'));
      setSubmitting(false);
    }
  }

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <AuthLayout title="Create your account" subtitle="Start collaborating with your team in real time.">
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {error && error.code !== 'VALIDATION_ERROR' && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <FormField
          label="Full name"
          autoComplete="name"
          required
          maxLength={80}
          value={form.displayName}
          onChange={update('displayName')}
          error={fieldErrors.displayName}
        />
        <FormField
          label="Work email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update('email')}
          error={fieldErrors.email}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={update('password')}
          error={fieldErrors.password}
          hint="At least 8 characters, including a letter and a number."
        />
        <Button type="submit" className="h-11 w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
