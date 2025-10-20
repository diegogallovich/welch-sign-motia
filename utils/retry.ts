/**
 * Retry utility with exponential backoff for handling transient API failures
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export interface RetryMetadata {
  totalAttempts: number;
  delays: number[];
  errors: string[];
  isRetryable: boolean;
}

/**
 * Determines if an error is retryable based on error type and status code
 */
export function isRetryableError(error: unknown): boolean {
  // Network errors and timeouts are always retryable
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  // Check for specific error patterns
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Network-related errors
  if (
    lowerMessage.includes("fetch failed") ||
    lowerMessage.includes("network error") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("enotfound") ||
    lowerMessage.includes("econnreset")
  ) {
    return true;
  }

  // Check for HTTP status codes in error message
  // Retry on 5xx server errors and 429 rate limiting
  const statusMatch = errorMessage.match(/status[:\s]+(\d{3})/i);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    // Retry on 5xx server errors or 429 rate limiting
    if (statusCode >= 500 || statusCode === 429) {
      return true;
    }
    // Don't retry on 4xx client errors (except 429)
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  // Check for specific error codes in the error message
  if (
    lowerMessage.includes("500") ||
    lowerMessage.includes("502") ||
    lowerMessage.includes("503") ||
    lowerMessage.includes("504") ||
    lowerMessage.includes("429")
  ) {
    return true;
  }

  // Authentication and client errors should not be retried
  if (
    lowerMessage.includes("401") ||
    lowerMessage.includes("403") ||
    lowerMessage.includes("404") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden")
  ) {
    return false;
  }

  // Default: retry on unknown errors (conservative approach)
  return true;
}

/**
 * Calculates exponential backoff delay with jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±25% randomization)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

/**
 * Executes a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  const metadata: RetryMetadata = {
    totalAttempts: 0,
    delays: [],
    errors: [],
    isRetryable: false,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    metadata.totalAttempts = attempt + 1;

    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      metadata.errors.push(errorMessage);
      metadata.isRetryable = shouldRetry(error);

      // If this is the last attempt or error is not retryable, throw
      if (attempt === maxAttempts || !metadata.isRetryable) {
        // Enhance error with retry metadata
        if (error instanceof Error) {
          (error as any).retryMetadata = metadata;
        }
        throw error;
      }

      // Calculate delay and wait before next attempt
      const delayMs = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      metadata.delays.push(delayMs);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1, delayMs);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Extracts retry metadata from an error if available
 */
export function getRetryMetadata(error: unknown): RetryMetadata | null {
  if (error && typeof error === "object" && "retryMetadata" in error) {
    return (error as any).retryMetadata;
  }
  return null;
}
