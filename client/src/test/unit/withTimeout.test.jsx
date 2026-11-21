import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REQUEST_TIMEOUT_MS,
  TimeoutError,
  CancelledError,
  isTimeoutError,
  isCancelledError,
  withTimeout,
} from '../../utils/withTimeout.js';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a 10-second default, the same deadline planned for BUG-22', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10000);
  });

  it('resolves when the work finishes in time', async () => {
    vi.useFakeTimers();
    const result = withTimeout(Promise.resolve('ok'));
    await expect(result).resolves.toBe('ok');
  });

  it('rejects with TimeoutError at the deadline and leaves the original work running', async () => {
    vi.useFakeTimers();
    let settled = false;
    const hung = new Promise((resolve) => {
      setTimeout(() => {
        settled = true;
        resolve('late');
      }, 15000);
    });
    const raced = withTimeout(hung, REQUEST_TIMEOUT_MS);
    const rejected = expect(raced).rejects.toSatisfy((error) => isTimeoutError(error) && error instanceof TimeoutError);
    await vi.advanceTimersByTimeAsync(9999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(true);
  });

  it('clears the timer when the signal aborts and rejects with CancelledError, not TimeoutError', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let late = false;
    const hung = new Promise((resolve) => {
      setTimeout(() => {
        late = true;
        resolve('late');
      }, 15000);
    });
    const raced = withTimeout(hung, REQUEST_TIMEOUT_MS, { signal: controller.signal });
    const rejected = expect(raced).rejects.toSatisfy(
      (error) => isCancelledError(error) && error instanceof CancelledError && !isTimeoutError(error),
    );
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 5000);
    expect(late).toBe(true);
  });
});
