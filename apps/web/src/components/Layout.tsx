/**
 * App shell: fixed 240px sidebar with nav + a top bar showing the page title.
 */
import {
  BarChart3,
  FileStack,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Moon,
  Sun,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/upload', label: 'Upload', icon: Upload, end: false },
  { to: '/chat', label: 'Chat', icon: MessagesSquare, end: false },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
] as const;

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/upload': 'Upload & Extract',
  '/chat': 'Requirements Chat',
  '/analytics': 'Token Economics',
};

function ThemeToggle(): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle theme"
      className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-surface text-muted hover:text-text hover:border-accent/50"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? (pathname.startsWith('/projects') ? 'Project' : 'SpecForge');

  return (
    <div className="min-h-full flex bg-background text-text">
      <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <div className="h-8 w-8 grid place-items-center rounded-lg bg-accent text-accent-fg">
            <FileStack size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight">SpecForge</span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted hover:text-text hover:bg-surface-2'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-2.5 px-1">
            <div className="h-8 w-8 grid place-items-center rounded-full bg-accent/15 text-accent text-xs font-semibold">
              {(user?.name ?? 'U').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{user?.name ?? 'User'}</div>
              <div className="text-[11px] text-muted truncate">{user?.email}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="text-muted hover:text-danger"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-6">
          <h1 className="text-base font-semibold">{title}</h1>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
