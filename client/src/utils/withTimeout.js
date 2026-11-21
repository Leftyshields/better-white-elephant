/**
 * Shared request deadline (guest ready insurance, and intended reuse for BUG-22).
 * Does not cancel the underlying work: the caller must ignore a late result.
 */
export const REQUEST_TIMEOUT_MS = 10000;

export class TimeoutError extends Error {
  constructor(message = 'Timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function isTimeoutError(error) {
  return error instanceof TimeoutError || error?.name === 'TimeoutError';
}

/**
 * Race `promise` against a timer. The original promise keeps running if it loses.
 * @param {Promise<unknown>} promise
 * @param {number} [ms]
 * @returns {Promise<unknown>}
 */
export function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    timeout,
  ]);
}
