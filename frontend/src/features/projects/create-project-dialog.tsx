import { Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/features/auth/form-field';
import { errorMessage, useCreateProject } from '@/features/work/api';
import type { Workspace } from '@/features/work/types';
import { ApiError } from '@/lib/api-client';

/** Suggests a key from the name: "Mobile App" -> "MA", "Website" -> "WEB". */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const key = words.length === 1 ? words[0]!.slice(0, 3) : words.map((w) => w[0]).join('').slice(0, 6);
  return /^[A-Z]/.test(key) ? key : `P${key}`.slice(0, 6);
}

/**
 * `workspaces` are the ones the user may create projects in (admin or owner).
 * When opened from a workspace page there is exactly one and the picker is hidden.
 */
export function CreateProjectDialog({ trigger, workspaces }: { trigger: ReactNode; workspaces: Workspace[] }) {
  const [open, setOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? '');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const create = useCreateProject();
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const project = await create.mutateAsync({ workspaceId, name, key, description });
      toast.success(`Project ${project.key} created`);
      setOpen(false);
      setName('');
      setKey('');
      setKeyEdited(false);
      setDescription('');
      navigate(`/projects/${project.id}`);
    } catch {
      /* rendered below */
    }
  }

  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {};

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !workspaces.some((w) => w.id === workspaceId)) setWorkspaceId(workspaces[0]?.id ?? '');
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Each project gets its own Kanban board. Tasks are numbered with the project key, like WEB-12.</DialogDescription>
          </DialogHeader>
          {workspaces.length > 1 && (
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger aria-label="Workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <FormField
              label="Name"
              value={name}
              maxLength={80}
              required
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                if (!keyEdited) setKey(suggestKey(e.target.value));
              }}
              error={fieldErrors.name}
            />
            <FormField
              label="Key"
              value={key}
              maxLength={6}
              required
              className="font-mono uppercase"
              onChange={(e) => {
                setKeyEdited(true);
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              }}
              error={fieldErrors.key}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
          </div>
          {create.isError && !Object.keys(fieldErrors).length && <p className="text-sm text-destructive">{errorMessage(create.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || key.length < 2 || !workspaceId || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
