/**
 * Live extraction progress via SSE, with a polling fallback if EventSource
 * fails. Shows an animated bar, stage label, live token + cost counters, and a
 * terminal state (View Results / Try Again).
 */
import type { ExtractionProgress as ProgressEvent, ProgressStage } from '@specforge/shared';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, getJob, withTokenParam } from '../lib/api';
import { Card, Spinner } from './ui';

const STAGE_LABELS: Record<ProgressStage, string> = {
  queued: 'Queued',
  downloading: 'Downloading document',
  parsing: 'Parsing document',
  extracting_epics: 'Extracting epics',
  extracting_stories: 'Extracting user stories',
  embedding: 'Generating embeddings',
  saving: 'Saving results',
  complete: 'Complete',
  failed: 'Failed',
};

interface Props {
  jobId: string;
  projectId: string;
  onRetry: () => void;
}

export function ExtractionProgress({ jobId, projectId, onRetry }: Props): JSX.Element {
  const navigate = useNavigate();
  const [event, setEvent] = useState<ProgressEvent>({
    jobId,
    stage: 'queued',
    percent: 0,
    message: 'Waiting to start...',
  });
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const source = new EventSource(withTokenParam(`${API_BASE}/api/jobs/${jobId}/progress`));

    const onProgress = (e: MessageEvent<string>): void => {
      try {
        const data = JSON.parse(e.data) as ProgressEvent;
        setEvent(data);
        if (data.stage === 'complete' || data.stage === 'failed') source.close();
      } catch {
        /* ignore malformed frames */
      }
    };
    source.addEventListener('progress', onProgress);

    // Fallback: if SSE errors, poll the job row every 2s.
    source.onerror = (): void => {
      source.close();
      if (pollRef.current !== null) return;
      pollRef.current = window.setInterval(async () => {
        const job = await getJob(jobId).catch(() => null);
        if (!job) return;
        setEvent({
          jobId,
          stage: (job.stage ?? 'queued') as ProgressStage,
          percent: job.progress,
          message: job.error ?? STAGE_LABELS[(job.stage ?? 'queued') as ProgressStage],
          costUsd: job.costUsd,
        });
        if (job.status === 'complete' || job.status === 'failed') {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
        }
      }, 2000);
    };

    return () => {
      source.close();
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [jobId]);

  const isComplete = event.stage === 'complete';
  const isFailed = event.stage === 'failed';

  return (
    <Card className="max-w-xl">
      <div className="flex items-center gap-3 mb-3">
        {isComplete ? (
          <CheckCircle2 className="text-success" />
        ) : isFailed ? (
          <XCircle className="text-danger" />
        ) : (
          <Spinner />
        )}
        <div className="font-medium">{STAGE_LABELS[event.stage]}</div>
      </div>

      <div className="h-2 w-full bg-background rounded overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${isFailed ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${event.percent}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted mt-2">
        <span>{event.message}</span>
        <span>
          {event.tokensUsed ? `${event.tokensUsed.toLocaleString()} tokens` : ''}
          {event.costUsd !== undefined ? `  ·  $${event.costUsd.toFixed(4)}` : ''}
        </span>
      </div>

      {isComplete ? (
        <button
          className="mt-4 px-4 py-2 rounded bg-accent text-white text-sm"
          onClick={() => navigate(`/projects/${projectId}`)}
        >
          View Results
        </button>
      ) : null}
      {isFailed ? (
        <button className="mt-4 px-4 py-2 rounded bg-surface border border-border text-sm" onClick={onRetry}>
          Try Again
        </button>
      ) : null}
    </Card>
  );
}
