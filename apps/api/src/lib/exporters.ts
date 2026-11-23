/**
 * Serialise a project's epics + stories to portable formats: Markdown (human
 * review), generic CSV (spreadsheets), Jira-compatible CSV (import wizard),
 * and autonomous-agent TASKS.json backlog items.
 */
import type { AgentTaskItem, Epic, Priority, Project, Story } from '@specforge/shared';
import { z } from 'zod';

/** Quotes and escapes a value for CSV (RFC 4180). */
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

/** Renders the project as a Markdown requirements document. */
export function toMarkdown(project: Project, epics: Epic[]): string {
  const lines: string[] = [`# ${project.name}`, ''];
  if (project.description) lines.push(project.description, '');
  lines.push(`> ${epics.length} epics · ${epics.reduce((n, e) => n + (e.stories?.length ?? 0), 0)} stories`, '');

  for (const epic of epics) {
    lines.push(`## ${epic.title}  _(${epic.priority})_`, '', epic.description, '');
    for (const story of epic.stories ?? []) {
      lines.push(`### ${story.title}`);
      const meta = [story.persona && `Persona: ${story.persona}`, story.storyPoints != null && `${story.storyPoints} pts`, `Priority: ${story.priority}`]
        .filter(Boolean)
        .join(' · ');
      if (meta) lines.push(`_${meta}_`);
      lines.push('', story.description, '');
      if (story.acceptanceCriteria.length > 0) {
        lines.push('**Acceptance criteria**');
        for (const ac of story.acceptanceCriteria) lines.push(`- ${ac}`);
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

/** Renders a flat CSV with one row per story (epics with no stories still emit a row). */
export function toCsv(epics: Epic[]): string {
  const header = ['epic', 'epic_priority', 'story', 'persona', 'story_points', 'story_priority', 'acceptance_criteria', 'confidence'];
  const rows = [csvRow(header)];
  for (const epic of epics) {
    const stories = epic.stories ?? [];
    if (stories.length === 0) {
      rows.push(csvRow([epic.title, epic.priority, '', '', '', '', '', epic.confidence]));
      continue;
    }
    for (const s of stories) {
      rows.push(
        csvRow([epic.title, epic.priority, s.title, s.persona, s.storyPoints, s.priority, s.acceptanceCriteria.join(' | '), s.confidence]),
      );
    }
  }
  return rows.join('\n');
}

/** Renders a Jira-import CSV: Epic rows followed by their Story rows linked via Epic Name. */
export function toJiraCsv(epics: Epic[]): string {
  const header = ['Issue Type', 'Summary', 'Description', 'Priority', 'Story Points', 'Epic Name', 'Epic Link'];
  const rows = [csvRow(header)];
  const jiraPriority: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
  for (const epic of epics) {
    rows.push(csvRow(['Epic', epic.title, epic.description, jiraPriority[epic.priority], '', epic.title, '']));
    for (const s of epic.stories ?? []) {
      const desc = [s.description, '', ...s.acceptanceCriteria.map((ac) => `* ${ac}`)].join('\n');
      rows.push(csvRow(['Story', s.title, desc, jiraPriority[s.priority], s.storyPoints, '', epic.title]));
    }
  }
  return rows.join('\n');
}

/** Supported export formats. */
export type ExportFormat = 'md' | 'csv' | 'jira';

/** Returns the body, content-type, and filename for an export request. */
export function exportProject(
  project: Project,
  epics: Epic[],
  format: ExportFormat,
): { body: string; contentType: string; filename: string } {
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  switch (format) {
    case 'md':
      return { body: toMarkdown(project, epics), contentType: 'text/markdown; charset=utf-8', filename: `${slug}.md` };
    case 'jira':
      return { body: toJiraCsv(epics), contentType: 'text/csv; charset=utf-8', filename: `${slug}-jira.csv` };
    case 'csv':
    default:
      return { body: toCsv(epics), contentType: 'text/csv; charset=utf-8', filename: `${slug}.csv` };
  }
}

/** Zod schema validating exported TASKS.json backlog items. */
export const TaskItemSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptance_criteria: z.array(z.string().min(1)).min(1),
});

export const TasksJsonExportSchema = z.array(TaskItemSchema);

const PRIORITY_NUMBER_MAP: Record<Priority, 1 | 2 | 3> = {
  high: 1,
  medium: 2,
  low: 3,
};

/** Derives a safe uppercase task ID prefix from an epic title or explicit prefix. */
function resolveTaskPrefix(epicTitle: string, explicitPrefix?: string): string {
  if (explicitPrefix && explicitPrefix.trim().length > 0) {
    const cleaned = explicitPrefix.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (cleaned.length > 0) return cleaned.slice(0, 12);
  }
  const letters = epicTitle
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 4);
  return letters.length >= 2 ? letters : 'TASK';
}

/**
 * Converts an epic and its stories into a validated TASKS.json backlog array
 * consumable by autonomous coding agents.
 */
export function epicToTasks(
  epic: Pick<Epic, 'title' | 'priority'>,
  stories: Array<Pick<Story, 'title' | 'description' | 'acceptanceCriteria' | 'priority' | 'persona'>>,
  prefix?: string,
): AgentTaskItem[] {
  const taskPrefix = resolveTaskPrefix(epic.title, prefix);
  const items = stories.map((story, idx): AgentTaskItem => {
    const criteria = story.acceptanceCriteria
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const descriptionParts = [story.description.trim()];
    if (story.persona && story.persona.trim().length > 0) {
      descriptionParts.push(`Persona: ${story.persona.trim()}`);
    }
    return {
      id: `${taskPrefix}-${String(idx + 1).padStart(3, '0')}`,
      status: 'TODO',
      priority: PRIORITY_NUMBER_MAP[story.priority ?? epic.priority] ?? 2,
      title: story.title.trim(),
      description: descriptionParts.join(' | '),
      acceptance_criteria:
        criteria.length > 0 ? criteria : [`Implement and verify: ${story.title.trim()}`],
    };
  });

  return TasksJsonExportSchema.parse(items);
}
