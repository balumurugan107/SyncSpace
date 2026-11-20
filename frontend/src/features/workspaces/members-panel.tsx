import { useRealtime } from '@/features/realtime/realtime-provider';
import { DoorOpen, Loader2, UserMinus, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-provider';
import { errorMessage, useAddMember, useMembers, useRemoveMember, useUpdateMember } from '@/features/work/api';
import { RoleBadge, UserAvatar } from '@/features/work/task-meta';
import type { Member, Workspace } from '@/features/work/types';
import { formatRelative } from '@/lib/utils';

type AssignableRole = 'admin' | 'member';

function AddMemberForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('member');
  const add = useAddMember(workspaceId);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const member = await add.mutateAsync({ email, role });
      toast.success(`${member.displayName} added as ${member.role}`);
      setEmail('');
    } catch {
      /* rendered below */
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border bg-muted/25 p-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            add.reset();
          }}
          aria-label="Email of the person to add"
          aria-invalid={add.isError}
          required
        />
        <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
          <SelectTrigger className="sm:w-32" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!email.trim() || add.isPending}>
          {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Add
        </Button>
      </div>
      {add.isError ? (
        <p className="text-xs text-destructive">{errorMessage(add.error)}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Add a teammate using the email address of their existing SyncSpace account.</p>
      )}
    </form>
  );
}

function MemberRow({ member, workspace, canManage }: { member: Member; workspace: Workspace; canManage: boolean }) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const update = useUpdateMember(workspace.id);
  const remove = useRemoveMember(workspace.id);
  const [confirming, setConfirming] = useState(false);
  const { online } = useRealtime();
  const isOnline = online[workspace.id]?.includes(member.userId);
  const isMe = member.userId === me.id;
  const editable = canManage && member.role !== 'owner' && !isMe;

  return (
    <li className="flex flex-wrap items-center gap-4 p-4">
      <UserAvatar name={member.displayName} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.displayName} {isOnline && <span className="ml-1 text-xs text-success">Online</span>} {isMe && <span className="font-normal text-muted-foreground">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {member.email} · joined {formatRelative(member.joinedAt)}
        </p>
      </div>
      {editable ? (
        <Select
          value={member.role}
          onValueChange={(role) =>
            update.mutate(
              { userId: member.userId, role: role as AssignableRole },
              {
                onSuccess: () => toast.success(`${member.displayName} is now ${role}`),
                onError: (error) => toast.error(errorMessage(error)),
              },
            )
          }
        >
          <SelectTrigger className="h-8 w-28" aria-label={`Role of ${member.displayName}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <RoleBadge role={member.role} />
      )}
      {(editable || (isMe && member.role !== 'owner')) && (
        <Button variant="ghost" size="icon" className="size-9" onClick={() => setConfirming(true)} aria-label={isMe ? 'Leave workspace' : `Remove ${member.displayName}`}>
          {isMe ? <DoorOpen /> : <UserMinus />}
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={isMe ? `Leave ${workspace.name}?` : `Remove ${member.displayName}?`}
        description={
          isMe
            ? 'You will lose access to its projects and boards. Tasks assigned to you there will be unassigned.'
            : 'They will lose access to this workspace. Tasks assigned to them here will be unassigned.'
        }
        confirmLabel={isMe ? 'Leave workspace' : 'Remove member'}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(member.userId);
            toast.success(isMe ? `You left ${workspace.name}` : `${member.displayName} removed`);
            if (isMe) navigate('/workspaces');
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </li>
  );
}

export function MembersPanel({ workspace }: { workspace: Workspace }) {
  const members = useMembers(workspace.id);
  const canManage = workspace.role !== 'member';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Owners and admins manage members and projects. Everyone can create, edit and move tasks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canManage && <AddMemberForm workspaceId={workspace.id} />}
        {members.isPending ? (
          <Skeleton className="h-28" />
        ) : members.isError ? (
          <p className="text-sm text-destructive">{errorMessage(members.error)}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {members.data.map((member) => (
              <MemberRow key={member.userId} member={member} workspace={workspace} canManage={canManage} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
