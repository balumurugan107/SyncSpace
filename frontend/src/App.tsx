import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { RedirectIfAuthenticated, RequireAuth } from '@/features/auth/route-guards';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { ProjectsPage } from '@/features/projects/projects-page';
import { MyTasksPage } from '@/features/tasks/my-tasks-page';
import { WorkspacePage } from '@/features/workspaces/workspace-page';
import { WorkspacesPage } from '@/features/workspaces/workspaces-page';
import { SystemHealthPage } from '@/features/health/system-health-page';
import { ChatPage } from '@/features/chat/chat-page';
import { SettingsPage } from '@/features/settings/settings-page';

// React Flow is large; only download it when the Architecture Explorer is opened.
const BoardPage = lazy(() => import('@/features/board/board-page').then((module) => ({ default: module.BoardPage })));
const ArchitecturePage = lazy(() =>
  import('@/features/architecture/architecture-page').then((module) => ({ default: module.ArchitecturePage })),
);

export function App() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="workspaces/:workspaceId" element={<WorkspacePage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route
            path="projects/:projectId"
            element={
              <Suspense fallback={<p className="text-sm text-muted-foreground">Loading board…</p>}>
                <BoardPage />
              </Suspense>
            }
          />
          <Route path="chat" element={<ChatPage />} />
          <Route path="tasks" element={<MyTasksPage />} />
          <Route
            path="architecture"
            element={
              <Suspense fallback={<p className="text-sm text-muted-foreground">Loading Architecture Explorer…</p>}>
                <ArchitecturePage />
              </Suspense>
            }
          />
          <Route path="health" element={<SystemHealthPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
