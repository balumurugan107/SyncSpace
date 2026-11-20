import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/features/auth/form-field';
import { errorMessage, useDeleteWorkspace, useUpdateWorkspace } from '@/features/work/api';
import type { Workspace } from '@/features/work/types';

export function WorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateWorkspace(workspace.id);
  const remove = useDeleteWorkspace();
  const navigate = useNavigate();
  const unchanged = name.trim() === workspace.name && description.trim() === workspace.description;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({ name, description });
      toast.success('Workspace updated');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Visible to every member.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="max-w-xl space-y-5">
            <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            <div className="space-y-2">
              <Label htmlFor="ws-settings-description">Description</Label>
              <Textarea id="ws-settings-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
            </div>
            <Button type="submit" disabled={unchanged || !name.trim() || update.isPending}>
              {update.isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {workspace.role === 'owner' && (
        <Card className="border-destructive/25 bg-destructive/[0.025]">
          <CardHeader>
            <CardTitle>Delete workspace</CardTitle>
            <CardDescription>Permanently deletes every project, task and activity record in it. This cannot be undone.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete workspace
            </Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${workspace.name}?`}
        description={`This removes ${workspace.projectCount} project(s) and all of their tasks for all ${workspace.memberCount} member(s).`}
        confirmLabel="Delete forever"
        confirmText={workspace.name}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(workspace.id);
            toast.success(`${workspace.name} deleted`);
            navigate('/workspaces');
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}
