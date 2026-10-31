/**
 * Analytics page: token-economics KPIs, daily-cost area chart, model usage
 * doughnut, an interactive three-tier cost estimator, and an expandable recent
 * jobs table. This is the feature that signals production-minded AI engineering.
 */
import type { ExtractionAnalyticsRow } from '@specforge/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Fragment, useState } from 'react';
import {
  useAnalyticsByModel,
  useAnalyticsJobs,
  useAnalyticsOverview,
  useAnalyticsTimeline,
  useCostEstimate,
} from '../lib/hooks';
import { Card, Skeleton, StatCard } from '../components/ui';

const CHART_AXIS = { stroke: '#718096', fontSize: 12 };
const PIE_COLOURS = ['#667eea', '#68d391', '#f6e05e', '#fc8181', '#9f7aea'];
const TOOLTIP_STYLE = { background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 8 };

function cacheColour(rate: number): string {
  if (rate < 20) return '#fc8181';
  if (rate < 60) return '#f6e05e';
  return '#68d391';
}

function CostEstimator(): JSX.Element {
  const [docsPerMonth, setDocsPerMonth] = useState(100);
  const [avgPages, setAvgPages] = useState(10);
  const estimate = useCostEstimate(docsPerMonth, avgPages);

  return (
    <Card>
      <div className="text-sm font-medium mb-3">Cost Estimator</div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-muted mb-1">Docs / month: {docsPerMonth}</label>
          <input
            type="range"
            min={1}
            max={10000}
            value={docsPerMonth}
            onChange={(e) => setDocsPerMonth(Number(e.target.value))}
            className="w-full accent-[#667eea]"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Avg pages / doc: {avgPages}</label>
          <input
            type="range"
            min={1}
            max={100}
            value={avgPages}
            onChange={(e) => setAvgPages(Number(e.target.value))}
            className="w-full accent-[#667eea]"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {estimate.data?.tiers.map((tier) => {
          const recommended = tier.tier === estimate.data?.recommended;
          return (
            <div
              key={tier.tier}
              className={`rounded-lg border p-3 text-center ${
                recommended ? 'border-accent bg-accent/10' : 'border-border bg-background'
              }`}
            >
              <div className="text-xs uppercase text-muted">{tier.tier}</div>
              <div className="text-lg font-semibold mt-1">${tier.monthlyCostUsd.toFixed(2)}</div>
              <div className="text-[10px] text-muted">/ month</div>
              {recommended ? <div className="text-[10px] text-accent mt-1">Recommended</div> : null}
            </div>
          );
        })}
      </div>
      {estimate.data ? (
        <div className="text-xs text-muted mt-3">
          ~{estimate.data.estimatedInputTokens.toLocaleString()} input tokens / month estimated.
        </div>
      ) : null}
    </Card>
  );
}

function JobsTable({ rows }: { rows: ExtractionAnalyticsRow[] }): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const statusColour: Record<string, string> = {
    complete: 'text-success',
    failed: 'text-danger',
    processing: 'text-warning',
    queued: 'text-muted',
  };

  if (rows.length === 0) {
    return <div className="text-muted text-sm">No extraction jobs yet.</div>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted text-xs border-b border-border">
          <th className="py-2">Document</th>
          <th>Project</th>
          <th>Model</th>
          <th className="text-right">Tokens</th>
          <th className="text-right">Cost</th>
          <th className="text-right">Duration</th>
          <th className="text-right">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((job) => {
          const tokens = job.promptTokens + job.completionTokens;
          const open = expanded === job.id;
          return (
            <Fragment key={job.id}>
              <tr
                className="border-b border-border/50 cursor-pointer hover:bg-background"
                onClick={() => setExpanded(open ? null : job.id)}
              >
                <td className="py-2 max-w-[180px] truncate">{job.filename}</td>
                <td className="text-muted">{job.projectName}</td>
                <td className="text-muted text-xs">{job.model ?? '—'}</td>
                <td className="text-right">{tokens.toLocaleString()}</td>
                <td className="text-right">${job.costUsd.toFixed(4)}</td>
                <td className="text-right text-muted">
                  {job.latencyMs ? `${(job.latencyMs / 1000).toFixed(1)}s` : '—'}
                </td>
                <td className={`text-right ${statusColour[job.status] ?? ''}`}>{job.status}</td>
              </tr>
              {open ? (
                <tr className="bg-background">
                  <td colSpan={7} className="p-3 text-xs text-muted">
                    <div className="grid grid-cols-4 gap-3">
                      <span>Prompt: {job.promptTokens.toLocaleString()}</span>
                      <span>Completion: {job.completionTokens.toLocaleString()}</span>
                      <span>Cache read: {job.cacheReadTokens.toLocaleString()}</span>
                      <span>Cache write: {job.cacheWriteTokens.toLocaleString()}</span>
                      <span>Epics: {job.epicCount}</span>
                      <span>Stories: {job.storyCount}</span>
                      <span>Size: {(job.sizeBytes / 1024).toFixed(0)} KB</span>
                      <span>Type: {job.mimeType.split('/').pop()}</span>
                    </div>
                    {job.error ? <div className="text-danger mt-2">Error: {job.error}</div> : null}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function Analytics(): JSX.Element {
  const overview = useAnalyticsOverview();
  const timeline = useAnalyticsTimeline(30);
  const byModel = useAnalyticsByModel();
  const jobs = useAnalyticsJobs(20);

  const avgCost = overview.data?.avgCostPerDocument ?? 0;
  const cacheRate = overview.data?.cacheHitRate ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {overview.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard label="Total Docs" value={overview.data?.totalDocuments ?? 0} />
            <StatCard label="Total Cost" value={`$${(overview.data?.totalCostUsd ?? 0).toFixed(4)}`} />
            <StatCard
              label="Avg Cost / Doc"
              value={`$${avgCost.toFixed(4)}`}
              hint={`${overview.data?.totalStories ?? 0} stories total`}
            />
            <Card>
              <div className="text-muted text-sm" title="Higher cache hit rate means lower costs — system prompts reused across calls.">
                Cache Hit Rate
              </div>
              <div className="text-2xl font-semibold mt-1" style={{ color: cacheColour(cacheRate) }}>
                {cacheRate.toFixed(1)}%
              </div>
              <div className="text-muted text-xs mt-1">System-prompt reuse efficiency</div>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <div className="text-sm font-medium mb-3">Daily Cost (last 30 days)</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeline.data ?? []}>
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#667eea" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#667eea" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="date" {...CHART_AXIS} />
              <YAxis {...CHART_AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `$${v.toFixed(4)}`} />
              <Area type="monotone" dataKey="costUsd" stroke="#667eea" fill="url(#costFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div className="text-sm font-medium mb-3">Tokens by Model</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={byModel.data ?? []}
                dataKey="totalTokens"
                nameKey="model"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
              >
                {(byModel.data ?? []).map((_, i) => (
                  <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => v.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <CostEstimator />

      <Card>
        <div className="text-sm font-medium mb-3">Recent Extraction Jobs</div>
        {jobs.isLoading ? <Skeleton className="h-32" /> : <JobsTable rows={jobs.data ?? []} />}
      </Card>
    </div>
  );
}
