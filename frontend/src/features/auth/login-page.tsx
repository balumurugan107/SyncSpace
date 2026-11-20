import { AlertCircle, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { AuthLayout } from './auth-layout';
import { useAuth } from './auth-provider';
import { FormField } from './form-field';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
      // RedirectIfAuthenticated navigates once the auth state flips.
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'NETWORK', 'Could not reach the server'));
      setSubmitting(false);
    }
  }

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your SyncSpace account.">
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {error && error.code !== 'VALIDATION_ERROR' && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" className="h-11 w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to SyncSpace?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
