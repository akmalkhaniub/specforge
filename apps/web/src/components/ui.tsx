/**
 * Small presentational primitives shared across pages. Pure, no data fetching.
 */
import type { Priority } from '@specforge/shared';
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <div
      className={`bg-surface border border-border rounded-xl p-4 shadow-card dark:shadow-card-dark ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}): JSX.Element {
  return (
    <Card>
      <div className="text-muted text-sm">{label}</div>
      <div className="text-text text-2xl font-semibold mt-1">{value}</div>
      {hint ? <div className="text-muted text-xs mt-1">{hint}</div> : null}
    </Card>
  );
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-danger/20 text-danger border-danger/40',
  medium: 'bg-warning/20 text-warning border-warning/40',
  low: 'bg-success/20 text-success border-success/40',
};

export function PriorityBadge({ priority }: { priority: Priority }): JSX.Element {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-background border border-border text-muted">
      {children}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }): JSX.Element {
  return <div className={`animate-pulse bg-border/50 rounded ${className}`} />;
}

export function Spinner(): JSX.Element {
  return (
    <div className="h-5 w-5 border-2 border-border border-t-accent rounded-full animate-spin" />
  );
}

export function ConfidenceBar({ value }: { value: number | null }): JSX.Element {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-background rounded overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted">{pct}%</span>
    </div>
  );
}
