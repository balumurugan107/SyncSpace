import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/features/auth/form-field';
import { errorMessage, useDeleteProject, useUpdateProject } from '@/features/work/api';
import type { Project } from '@/features/work/types';

export function ProjectSettingsDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateProject(project.id);
  const remove = useDeleteProject();
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({ name, description });
      toast.success('Project updated');
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Project settings</DialogTitle>
              <DialogDescription>
                The key <span className="font-mono font-semibold">{project.key}</span> cannot change: it is part of every task id already shared.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            <div className="space-y-2">
              <Label htmlFor="project-settings-description">Description</Label>
              <Textarea id="project-settings-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
            </div>
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                Delete project
              </Button>
              <Button type="submit" disabled={!name.trim() || update.isPending || (name.trim() === project.name && description.trim() === project.description)}>
                {update.isPending && <Loader2 className="animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${project.name}?`}
        description="All of its tasks and their history will be permanently deleted."
        confirmLabel="Delete project"
        confirmText={project.key}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(project.id);
            toast.success(`${project.name} deleted`);
            navigate(`/workspaces/${project.workspaceId}`);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
