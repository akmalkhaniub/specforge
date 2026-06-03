/**
 * Typed error classes for SpecForge.
 *
 * Every error path throws one of these — never a bare `Error`. Each carries a
 * machine-readable `code` (returned in the API error envelope) and a `context`
 * bag of structured fields for logging. `httpStatus` maps the error to a
 * response status when it surfaces at the API boundary.
 */

/** Base class for all application errors. */
export abstract class AppError extends Error {
  /** Machine-readable error code, e.g. 'STORAGE_ERROR'. */
  abstract readonly code: string;
  /** HTTP status to return if this error reaches the API boundary. */
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    public readonly context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A required resource could not be found. */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

/** Request input failed validation. */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;
}

/** Object storage (MinIO) operation failed. */
export class StorageError extends AppError {
  readonly code = 'STORAGE_ERROR';
  readonly httpStatus = 502;
}

/** An LLM call failed or returned an unusable response. */
export class LLMError extends AppError {
  readonly code = 'LLM_ERROR';
  readonly httpStatus = 502;
}

/** The extraction pipeline failed in a way that should fail the job. */
export class ExtractionError extends AppError {
  readonly code = 'EXTRACTION_ERROR';
  readonly httpStatus = 500;
}
