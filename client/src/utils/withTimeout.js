/**
 * Shared request deadline (guest ready insurance, and intended reuse for BUG-22).
 * Does not cancel the underlying work: the caller must ignore a late result.
 * Pass an AbortSignal (for example on unmount) to clear the timer early.
 */
export const REQUEST_TIMEOUT_MS = 10000;

export class TimeoutError extends Error {
  constructor(message = 'Timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class CancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

export function isTimeoutError(error) {
  return error instanceof TimeoutError || error?.name === 'TimeoutError';
}

export function isCancelledError(error) {
  return error instanceof CancelledError || error?.name === 'CancelledError';
}

/**
 * Race `promise` against a timer. The original promise keeps running if it loses.
 * If `options.signal` aborts, the timer is cleared and the race rejects with CancelledError.
 * @param {Promise<unknown>} promise
 * @param {number} [ms]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<unknown>}
 */
export function withTimeout(promise, ms = REQUEST_TIMEOUT_MS, options = {}) {
  const signal = options?.signal;
  let timer;
  let onAbort;
  const timeout = new Promise((_, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new CancelledError());
    };
    if (signal?.aborted) {
      cancel();
      return;
    }
    timer = setTimeout(() => reject(new TimeoutError()), ms);
    if (signal) {
      onAbort = cancel;
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    }),
    timeout,
  ]);
}
