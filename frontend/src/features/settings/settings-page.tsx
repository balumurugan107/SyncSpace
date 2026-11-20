import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Laptop, Loader2, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth, useCurrentUser } from '@/features/auth/auth-provider';
import { FormField } from '@/features/auth/form-field';
import { api, ApiError, type User } from '@/lib/api-client';
import { queryKeys, useSessions } from '@/lib/queries';
import { cn, describeUserAgent, formatRelative } from '@/lib/utils';
import { useTheme, type Theme } from '@/providers/theme-provider';

function ProfileCard() {
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName);
  const mutation = useMutation({
    mutationFn: (name: string) => api.patch<{ user: User }>('/users/me', { displayName: name }),
    onSuccess: ({ user: updated }) => {
      setUser(updated);
      setDisplayName(updated.displayName);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(displayName);
  }

  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const unchanged = displayName.trim() === user.displayName;

  return (
    <Card className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How teammates will see you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-xl space-y-5">
          <FormField
            label="Display name"
            value={displayName}
            maxLength={80}
            onChange={(event) => {
              setDisplayName(event.target.value);
              mutation.reset();
            }}
            error={error?.fieldErrors.displayName ?? (error ? error.message : undefined)}
          />
          <FormField label="Email" value={user.email} disabled hint="Email changes are not supported yet." />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={unchanged || mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
            {mutation.isSuccess && unchanged && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="size-4" /> Saved
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];
  return (
    <Card className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Saved on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid max-w-xl grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border-2 p-4 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                theme === value && 'border-primary bg-primary/5 text-primary',
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const sessions = useSessions();
  const { logoutEverywhere } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: logoutEverywhere, onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }) });

  return (
    <Card className="scroll-mt-24">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Every device signed in to your account. Each session renews itself and expires after 7 days of inactivity.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
          Sign out everywhere
        </Button>
      </CardHeader>
      <CardContent>
        {sessions.isPending ? (
          <Skeleton className="h-14" />
        ) : sessions.isError ? (
          <p className="text-sm text-destructive">Could not load sessions.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sessions.data.map((session) => (
              <li key={session.familyId} className="flex flex-wrap items-center gap-4 p-4">
                <Laptop className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{describeUserAgent(session.userAgent)}</p>
                  <p className="text-xs text-muted-foreground">
                    Signed in {formatRelative(session.signedInAt)} · last renewed {formatRelative(session.lastActiveAt)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                  </p>
                </div>
                {session.current && <Badge variant="success">This device</Badge>}
              </li>
            ))}
          </ul>
        )}
        {mutation.isError && <p className="mt-3 text-sm text-destructive">{(mutation.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="page-content">
      <PageHeader eyebrow="Make yourself at home" title="Settings" description="Your profile, your preferences and the devices you trust." />
      <div className="grid items-start gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-2 xl:sticky xl:top-24 xl:flex-col">{[['profile','Profile'],['appearance','Appearance'],['sessions','Active sessions']].map(([id,label]) => <a key={id} href={`#${id}`} className="flex min-h-11 shrink-0 items-center rounded-lg px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</a>)}</nav>
        <div className="min-w-0 space-y-6"><section id="profile" className="scroll-mt-24"><ProfileCard /></section><section id="appearance" className="scroll-mt-24"><AppearanceCard /></section><section id="sessions" className="scroll-mt-24"><SessionsCard /></section></div>
      </div>
    </div>
  );
}
