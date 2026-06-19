/**
 * Project page: header stats, semantic search, and an accordion of epics with
 * their user stories.
 */
import type { Epic, Priority, Story } from '@specforge/shared';
import { ChevronDown, ChevronRight, Download, FileText, Pencil, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE, authHeaders, documentDownloadUrl, projectExportUrl } from '../lib/api';
import { readSSE } from '../lib/sse';
import {
  useProject,
  useProjectDocuments,
  useReprocessDocument,
  useSearch,
  useUpdateStory,
} from '../lib/hooks';
import { Card, Chip, ConfidenceBar, PriorityBadge, Skeleton } from '../components/ui';

function ExportMenu({ projectId }: { projectId: string }): JSX.Element {
  const link = (fmt: string): string => projectExportUrl(projectId, fmt);
  const formats: Array<{ fmt: string; label: string }> = [
    { fmt: 'md', label: 'Markdown' },
    { fmt: 'csv', label: 'CSV' },
    { fmt: 'jira', label: 'Jira CSV' },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted flex items-center gap-1">
        <Download size={14} /> Export
      </span>
      {formats.map(({ fmt, label }) => (
        <a
          key={fmt}
          href={link(fmt)}
          className="text-xs px-2 py-1 rounded border border-border bg-surface hover:border-accent/50 hover:text-accent"
        >
          {label}
        </a>
      ))}
    </div>
  );
}

function StoryCard({ story, projectId }: { story: Story; projectId: string }): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description);
  const [priority, setPriority] = useState<Priority>(story.priority);
  const update = useUpdateStory(projectId);

  const save = (): void => {
    update.mutate(
      { id: story.id, patch: { title, description, priority } },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <div className="bg-background border border-accent/40 rounded-md p-3 space-y-2">
        <input
          className="w-full bg-surface border border-border rounded px-2 py-1 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full bg-surface border border-border rounded px-2 py-1 text-xs"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <select
            className="bg-surface border border-border rounded px-2 py-1 text-xs"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <div className="flex gap-2">
            <button className="text-xs px-2 py-1 rounded border border-border" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="text-xs px-2 py-1 rounded bg-accent text-accent-fg disabled:opacity-50"
              disabled={update.isPending || !title.trim()}
              onClick={save}
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-md p-3 group">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{story.title}</div>
        <div className="flex items-center gap-2">
          {story.persona ? <Chip>{story.persona}</Chip> : null}
          {story.storyPoints !== null ? <Chip>{story.storyPoints} pts</Chip> : null}
          <PriorityBadge priority={story.priority} />
          <button
            className="text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit story"
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} />
          </button>
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

interface AskSource {
  sourceType: string;
  sourceId: string;
  content: string;
}

function AskPanel({ projectId }: { projectId: string }): JSX.Element {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<AskSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (): Promise<void> => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setAnswer('');
    setSources([]);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question: q }),
      });
      if (!res.body) throw new Error('No response stream');
      await readSSE(res.body, (event, data) => {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (event === 'sources' && Array.isArray(parsed.sources)) {
          setSources(parsed.sources as AskSource[]);
        } else if (event === 'chunk' && typeof parsed.text === 'string') {
          setAnswer((a) => a + parsed.text);
        } else if (event === 'error' && typeof parsed.message === 'string') {
          setError(parsed.message);
        }
      });
    } catch {
      setError('Ask failed. Is the API key configured and in credit?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="text-sm font-medium mb-2 flex items-center gap-2">
        <Sparkles size={15} className="text-accent" /> Ask your requirements
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm"
          placeholder="e.g. How are payments handled? What covers password reset?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask();
          }}
        />
        <button
          className="px-3 py-2 rounded bg-accent text-accent-fg text-sm disabled:opacity-50"
          disabled={busy || !question.trim()}
          onClick={() => void ask()}
        >
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </div>
      {error ? <div className="text-danger text-xs mt-2">{error}</div> : null}
      {answer ? <div className="text-sm mt-3 whitespace-pre-wrap">{answer}</div> : null}
      {sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {sources.map((s, i) => (
            <span key={s.sourceId} className="text-[11px] px-1.5 py-0.5 rounded bg-background border border-border text-muted">
              [{i + 1}] {s.content.split(':')[0]?.slice(0, 28)}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function DocumentsSection({ projectId }: { projectId: string }): JSX.Element | null {
  const docs = useProjectDocuments(projectId);
  const reprocess = useReprocessDocument(projectId);
  if (!docs.data || docs.data.length === 0) return null;

  const statusColour: Record<string, string> = {
    extracted: 'text-success',
    failed: 'text-danger',
    processing: 'text-warning',
    pending: 'text-muted',
  };

  return (
    <Card>
      <div className="text-sm font-medium mb-3">Documents</div>
      <div className="space-y-2">
        {docs.data.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={15} className="text-muted shrink-0" />
              <span className="truncate">{d.filename}</span>
              <span className={`text-xs ${statusColour[d.status] ?? 'text-muted'}`}>· {d.status}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a href={documentDownloadUrl(d.id)} className="text-xs text-accent hover:underline">
                Download
              </a>
              <button
                className="text-xs flex items-center gap-1 text-muted hover:text-accent disabled:opacity-50"
                disabled={reprocess.isPending}
                onClick={() => reprocess.mutate(d.id)}
                title="Re-run extraction"
              >
                <RefreshCw size={12} /> Re-extract
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EpicCard({
  epic,
  highlighted,
  projectId,
}: {
  epic: Epic;
  highlighted: boolean;
  projectId: string;
}): JSX.Element {
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
            <StoryCard key={s.id} story={s} projectId={projectId} />
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{name}</h2>
          {description ? <p className="text-muted text-sm mt-1">{description}</p> : null}
          <div className="flex gap-2 mt-2">
            <Chip>{epics.length} epics</Chip>
            <Chip>{storyCount} stories</Chip>
            <Chip>{project.data.documentCount} docs</Chip>
          </div>
        </div>
        {epics.length > 0 && id ? <ExportMenu projectId={id} /> : null}
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

      {id && epics.length > 0 ? <AskPanel projectId={id} /> : null}

      {epics.length === 0 ? (
        <Card>
          <div className="text-muted text-sm">
            No epics yet — upload a document to extract requirements.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {epics.map((epic) => (
            <EpicCard
              key={epic.id}
              epic={epic}
              highlighted={highlightedIds.has(epic.id)}
              projectId={id ?? ''}
            />
          ))}
        </div>
      )}

      {id ? <DocumentsSection projectId={id} /> : null}
    </div>
  );
}
