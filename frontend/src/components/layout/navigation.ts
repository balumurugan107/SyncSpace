import {
  Activity,
  Bell,
  Building2,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Network,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/** The phase the running build implements. Bump this as each phase ships. */
export const CURRENT_PHASE = 4;

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Phase in which this page becomes functional. Later items render as disabled. */
  phase: number;
  group: 'collaborate' | 'system';
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, phase: 1, group: 'collaborate' },
  { label: 'Workspaces', to: '/workspaces', icon: Building2, phase: 2, group: 'collaborate' },
  { label: 'Projects', to: '/projects', icon: FolderKanban, phase: 2, group: 'collaborate' },
  { label: 'My Tasks', to: '/tasks', icon: ListTodo, phase: 2, group: 'collaborate' },
  { label: 'Team Chat', to: '/chat', icon: MessagesSquare, phase: 4, group: 'collaborate' },
  { label: 'Notifications', to: '/notifications', icon: Bell, phase: 5, group: 'collaborate' },
  { label: 'Architecture Explorer', to: '/architecture', icon: Network, phase: 1, group: 'system' },
  { label: 'System Health', to: '/health', icon: Activity, phase: 1, group: 'system' },
  { label: 'Settings', to: '/settings', icon: Settings, phase: 1, group: 'system' },
];

export const isAvailable = (item: NavItem): boolean => item.phase <= CURRENT_PHASE;
