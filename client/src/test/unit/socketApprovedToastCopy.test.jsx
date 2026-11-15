import { describe, expect, it } from 'vitest';
import {
  SOCKET_APPROVED_TOAST_MESSAGES,
  formatSocketErrorForToast,
} from '../../../../server/shared/socket-error-copy.mjs';

describe('socket approved toast copy', () => {
  it.each([...SOCKET_APPROVED_TOAST_MESSAGES])(
    'passes through approved server line unchanged: %s',
    (approvedLine) => {
      expect(formatSocketErrorForToast(approvedLine)).toBe(approvedLine);
    },
  );

  it('maps unknown server errors to generic copy via shared formatter', () => {
    expect(formatSocketErrorForToast('persist failed')).toBe("That didn't work. Try again in a moment.");
  });

  it('uses connection-lost copy for socket disconnect', () => {
    expect(formatSocketErrorForToast('Socket not connected')).toBe(
      'Connection lost. Refresh the page to reconnect.',
    );
  });
});