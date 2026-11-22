/**
 * Host-only inline share block for Setup step 2 (Add participants):
 * intro, selectable party code, Copy link (primary) and Copy code (outline).
 * Rotate stays in the share modal. No toast.
 */
import { useEffect, useId } from 'react';
import { Button } from './ui/Button.jsx';
import { formatPartyCode } from '../utils/partyCode.js';
import { selectVisibleText } from '../utils/copyText.js';
import {
  HOST_SHARE_LOAD_FAILED,
  PARTY_INVITE_COPY as COPY,
  SETUP_INVITE_INTRO,
} from '../utils/partyInviteCopy.js';
import { useShareClipboard } from '../hooks/usePartyShareInvite.js';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

const OUTLINE_BTN =
  `inline-flex items-center justify-center min-h-11 w-full px-3 py-2 rounded-md font-medium transition-colors border border-slate-400 bg-transparent text-white hover:bg-slate-800/70 disabled:opacity-50 ${FOCUS_RING}`;

export function PartySetupInviteShare({ invite, loadFailed, link }) {
  const introId = useId();
  const {
    codeCopied,
    linkCopied,
    codeCopyFailed,
    linkCopyFailed,
    codeTextRef,
    linkFieldRef,
    copyCode,
    copyLink,
  } = useShareClipboard();

  const formatted = invite ? formatPartyCode(invite.code) : '';

  useEffect(() => {
    if (linkCopyFailed) selectVisibleText(linkFieldRef.current);
  }, [linkCopyFailed, link, linkFieldRef]);

  return (
    <div data-testid="setup-invite-share" className="mb-4 space-y-3">
      <p id={introId} className="text-sm text-slate-300">
        {SETUP_INVITE_INTRO}
      </p>

      <p
        ref={codeTextRef}
        data-testid="setup-invite-code"
        className="font-mono text-[20px] leading-tight tracking-[0.1em] whitespace-nowrap text-white select-all min-h-11"
      >
        {formatted}
      </p>

      <textarea
        ref={linkFieldRef}
        readOnly
        value={link}
        tabIndex={linkCopyFailed ? 0 : -1}
        aria-hidden={linkCopyFailed ? undefined : true}
        aria-label={linkCopyFailed ? COPY['host.share.link.copy_name'] : undefined}
        className={
          linkCopyFailed
            ? 'w-full min-h-11 px-3 py-2 bg-slate-950/50 border border-slate-700 rounded-md shadow-sm text-white font-mono text-sm break-all whitespace-pre-wrap resize-none overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'
            : 'sr-only'
        }
      />

      {loadFailed && !invite && (
        <p role="alert" className="text-sm text-red-300">
          {HOST_SHARE_LOAD_FAILED}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          aria-label={COPY['host.share.link.copy_name']}
          disabled={!invite}
          onClick={() => copyLink(link)}
          className="w-full min-h-11 whitespace-nowrap"
        >
          {linkCopied ? (
            <>
              <span aria-hidden="true" className="mr-1">
                ✓
              </span>
              {COPY['host.share.link.copy_done']}
            </>
          ) : (
            COPY['host.share.link.copy']
          )}
        </Button>
        <button
          type="button"
          aria-label={COPY['host.share.code.copy_name']}
          disabled={!invite}
          onClick={() => copyCode(formatted)}
          className={OUTLINE_BTN + ' whitespace-nowrap'}
        >
          {codeCopied ? (
            <>
              <span aria-hidden="true" className="mr-1">
                ✓
              </span>
              {COPY['host.share.code.copy_done']}
            </>
          ) : (
            COPY['host.share.code.copy']
          )}
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {linkCopied ? COPY['host.share.link.copy_status'] : ''}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {codeCopied ? COPY['host.share.code.copy_status'] : ''}
      </p>
      <p
        data-testid="setup-code-copy-failed"
        aria-live="polite"
        className={codeCopyFailed ? 'text-xs text-amber-200' : 'sr-only'}
      >
        {codeCopyFailed ? COPY['host.share.copy_failed'] : ''}
      </p>
      <p
        data-testid="setup-link-copy-failed"
        aria-live="polite"
        className={linkCopyFailed ? 'text-xs text-amber-200' : 'sr-only'}
      >
        {linkCopyFailed ? COPY['host.share.copy_failed'] : ''}
      </p>
    </div>
  );
}
