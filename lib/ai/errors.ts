/**
 * AI analysis error types
 * 
 * These are used for safe error handling and logging without exposing secrets
 */

export class AIAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIAnalysisError";
  }
}

export class LLMApiError extends AIAnalysisError {
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    options?: { status?: number; code?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "LLMApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

export class ValidationError extends AIAnalysisError {
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class MalformedResponseError extends AIAnalysisError {
  constructor(message: string, public readonly rawResponse?: string) {
    super(message);
    this.name = "MalformedResponseError";
  }
}

/**
 * Safe error logging utilities
 * Never log full error details that might contain secrets
 */

export function sanitizeErrorForLogging(error: unknown): {
  name: string;
  message: string;
  code?: string;
  status?: number;
} {
  if (error instanceof LLMApiError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
    };
  }

  if (error instanceof ValidationError) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (error instanceof AIAnalysisError) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: "An unknown error occurred",
  };
}
