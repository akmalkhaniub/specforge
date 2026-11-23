import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Epic, Story } from '@specforge/shared';
import { AppError } from '../src/lib/errors.js';
import { TasksJsonExportSchema, epicToTasks } from '../src/lib/exporters.js';

const mockSql = vi.fn();

vi.mock('../src/db/client.js', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}));

vi.mock('../src/middleware/auth.js', () => ({
  getAuth: () => ({ orgId: 'org-test-1', userId: 'user-1', role: 'admin' }),
}));

const { epics } = await import('../src/routes/epics.js');

const app = new Hono();
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code, details: err.context }, err.httpStatus as 400);
  }
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});
app.route('/api/epics', epics);

describe('TASKS.json export helper and route', () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it('converts epic stories into schema-valid TASKS.json backlog items', () => {
    const epic: Pick<Epic, 'title' | 'priority'> = {
      title: 'Authentication Hardening',
      priority: 'high',
    };
    const stories: Array<
      Pick<Story, 'title' | 'description' | 'acceptanceCriteria' | 'priority' | 'persona'>
    > = [
      {
        title: 'Enforce short-lived JWT expiry',
        description: 'As a security engineer, I want 15m JWT TTLs, so that stolen tokens expire quickly.',
        persona: 'Security Engineer',
        acceptanceCriteria: [
          'Expired tokens return HTTP 401',
          'Refresh endpoint issues new access token',
        ],
        priority: 'high',
      },
      {
        title: 'Add audit log entry on failed login',
        description: 'Record failed attempts with IP metadata.',
        persona: null,
        acceptanceCriteria: [],
        priority: 'low',
      },
    ];

    const tasks = epicToTasks(epic, stories, 'AUTH');
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      id: 'AUTH-001',
      status: 'TODO',
      priority: 1,
      title: 'Enforce short-lived JWT expiry',
      description:
        'As a security engineer, I want 15m JWT TTLs, so that stolen tokens expire quickly. | Persona: Security Engineer',
      acceptance_criteria: [
        'Expired tokens return HTTP 401',
        'Refresh endpoint issues new access token',
      ],
    });
    expect(tasks[1]).toEqual({
      id: 'AUTH-002',
      status: 'TODO',
      priority: 3,
      title: 'Add audit log entry on failed login',
      description: 'Record failed attempts with IP metadata.',
      acceptance_criteria: ['Implement and verify: Add audit log entry on failed login'],
    });
    expect(() => TasksJsonExportSchema.parse(tasks)).not.toThrow();
  });

  it('POST /api/epics/:id/export-tasks returns validated TASKS.json array', async () => {
    mockSql
      .mockResolvedValueOnce([
        {
          id: 'epic-123',
          projectId: 'proj-1',
          documentId: 'doc-1',
          title: 'Billing Pipeline',
          description: 'Handle invoices',
          priority: 'high',
          confidence: 0.91,
          metadata: {},
          createdAt: '2026-11-23T00:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'story-1',
          epicId: 'epic-123',
          title: 'Generate PDF receipt',
          description: 'Render receipt PDF on payment capture',
          persona: 'Finance Admin',
          acceptanceCriteria: ['PDF includes tax breakdown', 'Returns 200 status'],
          priority: 'medium',
          storyPoints: 3,
          confidence: 0.9,
          createdAt: '2026-11-23T00:00:00Z',
        },
      ]);

    const res = await app.request('/api/epics/epic-123/export-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: 'BILL' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    const parsed = TasksJsonExportSchema.parse(body);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('BILL-001');
    expect(parsed[0]?.priority).toBe(2);
    expect(parsed[0]?.status).toBe('TODO');
  });

  it('POST /api/epics/:id/export-tasks returns 404 when epic is missing', async () => {
    mockSql.mockResolvedValueOnce([]);

    const res = await app.request('/api/epics/missing-epic/export-tasks', {
      method: 'POST',
    });

    expect(res.status).toBe(404);
  });
});
