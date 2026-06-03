/**
 * Minimal structured JSON logger. Every log line is a single JSON object so
 * it can be ingested by Cloud Logging / any log pipeline without a parser.
 *
 * Usage: log.info('event_name', { jobId, durationMs })
 */

const SERVICE = 'specforge-api';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Fields attached to every log line. */
interface BaseFields {
  level: LogLevel;
  event: string;
  service: string;
  timestamp: string;
}

function emit(level: LogLevel, event: string, context: Record<string, unknown>): void {
  const line: BaseFields & Record<string, unknown> = {
    level,
    event,
    service: SERVICE,
    timestamp: new Date().toISOString(),
    ...context,
  };
  // Route errors to stderr, everything else to stdout.
  const serialised = JSON.stringify(line);
  if (level === 'error') {
    process.stderr.write(serialised + '\n');
  } else {
    process.stdout.write(serialised + '\n');
  }
}

export const log = {
  debug: (event: string, context: Record<string, unknown> = {}): void =>
    emit('debug', event, context),
  info: (event: string, context: Record<string, unknown> = {}): void =>
    emit('info', event, context),
  warn: (event: string, context: Record<string, unknown> = {}): void =>
    emit('warn', event, context),
  error: (event: string, context: Record<string, unknown> = {}): void =>
    emit('error', event, context),
};
