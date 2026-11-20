import { Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/features/auth/form-field';
import { errorMessage, useCreateWorkspace } from '@/features/work/api';
import { ApiError } from '@/lib/api-client';

export function CreateWorkspaceDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateWorkspace();
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const workspace = await create.mutateAsync({ name, description });
      toast.success(`Workspace “${workspace.name}” created`);
      setOpen(false);
      setName('');
      setDescription('');
      navigate(`/workspaces/${workspace.id}`);
    } catch {
      /* error rendered below */
    }
  }

  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>A workspace holds a team, its projects and their boards. You will be its owner.</DialogDescription>
          </DialogHeader>
          <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus error={fieldErrors.name} />
          <div className="space-y-2">
            <Label htmlFor="ws-description">Description (optional)</Label>
            <Textarea id="ws-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
          </div>
          {create.isError && !Object.keys(fieldErrors).length && <p className="text-sm text-destructive">{errorMessage(create.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
