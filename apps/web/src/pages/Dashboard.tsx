/**
 * Dashboard: headline stats + a grid of projects with a create-project modal.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsOverview, useCreateProject, useProjects } from '../lib/hooks';
import { useOrg } from '../lib/org';
import { Card, Skeleton, StatCard } from '../components/ui';

function NewProjectModal({ orgId, onClose }: { orgId: string; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateProject();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-5 w-96" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold mb-3">New Project</h2>
        <label className="block text-sm text-muted mb-1">Name</label>
        <input
          className="w-full bg-background border border-border rounded px-3 py-2 mb-3 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Project"
        />
        <label className="block text-sm text-muted mb-1">Description</label>
        <textarea
          className="w-full bg-background border border-border rounded px-3 py-2 mb-4 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-sm rounded border border-border" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-accent text-white disabled:opacity-50"
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { orgId, name: name.trim(), description: description.trim() || undefined },
                { onSuccess: onClose },
              )
            }
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dashboard(): JSX.Element {
  const { orgId } = useOrg();
  const projects = useProjects(orgId);
  const overview = useAnalyticsOverview(orgId);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {overview.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard label="Total Projects" value={projects.data?.length ?? 0} />
            <StatCard label="Documents Processed" value={overview.data?.totalDocuments ?? 0} />
            <StatCard label="Epics Extracted" value={overview.data?.totalEpics ?? 0} />
            <StatCard label="Total AI Cost" value={`$${(overview.data?.totalCostUsd ?? 0).toFixed(4)}`} />
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Projects</h2>
        <button
          className="px-3 py-1.5 text-sm rounded bg-accent text-white disabled:opacity-50"
          disabled={!orgId}
          onClick={() => setShowModal(true)}
        >
          New Project
        </button>
      </div>

      {projects.isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.data?.map((p) => (
            <Card key={p.id}>
              <div className="font-medium">{p.name}</div>
              <div className="text-muted text-sm mt-1 line-clamp-2 h-10">{p.description}</div>
              <div className="flex gap-3 text-xs text-muted mt-3">
                <span>{p.documentCount} docs</span>
                <span>{p.epicCount} epics</span>
              </div>
              <Link
                to={`/projects/${p.id}`}
                className="inline-block mt-3 text-sm text-accent hover:underline"
              >
                View →
              </Link>
            </Card>
          ))}
        </div>
      )}

      {showModal && orgId ? <NewProjectModal orgId={orgId} onClose={() => setShowModal(false)} /> : null}
    </div>
  );
}
