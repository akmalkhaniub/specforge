/**
 * Project page: header stats, semantic search, and an accordion of epics with
 * their user stories.
 */
import type { Epic, Story } from '@specforge/shared';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject, useSearch } from '../lib/hooks';
import { Card, Chip, ConfidenceBar, PriorityBadge, Skeleton } from '../components/ui';

function StoryCard({ story }: { story: Story }): JSX.Element {
  return (
    <div className="bg-background border border-border rounded-md p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{story.title}</div>
        <div className="flex items-center gap-2">
          {story.persona ? <Chip>{story.persona}</Chip> : null}
          {story.storyPoints !== null ? <Chip>{story.storyPoints} pts</Chip> : null}
          <PriorityBadge priority={story.priority} />
        </div>
      </div>
      <div className="text-xs text-muted mt-1">{story.description}</div>
      {story.acceptanceCriteria.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {story.acceptanceCriteria.map((ac, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted">
              <input type="checkbox" disabled className="mt-0.5" />
              <span>{ac}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EpicCard({ epic, highlighted }: { epic: Epic; highlighted: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  const stories = epic.stories ?? [];
  return (
    <Card className={highlighted ? 'ring-2 ring-accent' : ''}>
      <button className="w-full flex items-center justify-between" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <PriorityBadge priority={epic.priority} />
          <span className="font-medium text-left">{epic.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBar value={epic.confidence} />
          <span className="text-xs text-muted">{stories.length} stories</span>
        </div>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{epic.description}</p>
          {stories.map((s) => (
            <StoryCard key={s.id} story={s} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function Project(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id);
  const [query, setQuery] = useState('');
  const search = useSearch(id, query);

  const highlightedIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of search.data ?? []) if (r.sourceType === 'epic') set.add(r.sourceId);
    return set;
  }, [search.data]);

  if (project.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (!project.data) return <div className="text-muted">Project not found.</div>;

  const { name, description, epics } = project.data;
  const storyCount = epics.reduce((n, e) => n + (e.stories?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{name}</h2>
        {description ? <p className="text-muted text-sm mt-1">{description}</p> : null}
        <div className="flex gap-2 mt-2">
          <Chip>{epics.length} epics</Chip>
          <Chip>{storyCount} stories</Chip>
          <Chip>{project.data.documentCount} docs</Chip>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-muted" />
        <input
          className="w-full bg-surface border border-border rounded pl-9 pr-3 py-2 text-sm"
          placeholder="Search epics & stories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && search.data && highlightedIds.size === 0 && !search.isFetching ? (
          <div className="text-xs text-muted mt-1">No semantic matches (embeddings may be disabled).</div>
        ) : null}
      </div>

      {epics.length === 0 ? (
        <Card>
          <div className="text-muted text-sm">
            No epics yet — upload a document to extract requirements.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {epics.map((epic) => (
            <EpicCard key={epic.id} epic={epic} highlighted={highlightedIds.has(epic.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
