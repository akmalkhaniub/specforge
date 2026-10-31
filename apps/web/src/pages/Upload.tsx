/**
 * Upload page: pick a project, drag-and-drop a PDF/DOCX, start extraction, then
 * watch live progress.
 */
import { FileText, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { uploadDocument } from '../lib/api';
import { useProjects } from '../lib/hooks';
import { Card } from '../components/ui';
import { ExtractionProgress } from '../components/ExtractionProgress';

const ACCEPTED = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Upload(): JSX.Element {
  const projects = useProjects();
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<{ jobId: string; projectId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pickFile = (f: File | undefined): void => {
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError('Only PDF and DOCX files are supported');
      return;
    }
    setError(null);
    setFile(f);
  };

  const start = async (): Promise<void> => {
    if (!file || !projectId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await uploadDocument(file, projectId);
      setJob({ jobId: res.jobId, projectId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (job) {
    return (
      <ExtractionProgress
        jobId={job.jobId}
        projectId={job.projectId}
        onRetry={() => {
          setJob(null);
          setFile(null);
        }}
      />
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <label className="block text-sm text-muted mb-1">Project</label>
        <select
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Select a project…</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Card>

      <div
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
          dragging ? 'border-accent bg-accent/10' : 'border-border'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickFile(e.dataTransfer.files[0]);
        }}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3 text-text">
            <FileText className="text-accent" />
            <div className="text-left">
              <div className="text-sm">{file.name}</div>
              <div className="text-xs text-muted">{formatSize(file.size)}</div>
            </div>
          </div>
        ) : (
          <div className="text-muted">
            <UploadCloud className="mx-auto mb-2" />
            <div className="text-sm">Drag & drop a PDF or DOCX here</div>
            <label className="text-accent text-sm cursor-pointer hover:underline">
              or browse
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </label>
          </div>
        )}
      </div>

      {error ? <div className="text-danger text-sm">{error}</div> : null}

      <button
        className="px-4 py-2 rounded bg-accent text-white text-sm disabled:opacity-50"
        disabled={!file || !projectId || submitting}
        onClick={() => void start()}
      >
        {submitting ? 'Uploading…' : 'Start Extraction'}
      </button>
    </div>
  );
}
