/**
 * Host share box: party code (XXXX-XXXX) and invite link, each with its own Copy, plus the rotate
 * confirm that replaces both together (party-code spec section 4, Rev 4). Code and token come from
 * the game server's host-only route; the client never reads the code index.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from './ui/Modal.jsx';
import { Button } from './ui/Button.jsx';
import { postPartyCode } from '../utils/api.js';
import { buildPartyShareLink } from '../utils/partyInvite.js';
import { formatPartyCode } from '../utils/partyCode.js';
import { copyText, selectVisibleText } from '../utils/copyText.js';
import {
  HOST_INVITE_ROTATE_CONFIRM,
  HOST_INVITE_ROTATE_CTA,
  HOST_INVITE_ROTATE_DONE,
  HOST_INVITE_ROTATE_FAILED,
  HOST_INVITE_ROTATE_HELPER,
  HOST_INVITE_ROTATE_RETRY,
  HOST_SHARE_LOAD_FAILED,
  PARTY_INVITE_COPY as COPY,
} from '../utils/partyInviteCopy.js';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

const SHARE_LINK_FIELD_CLASSES =
  'w-full min-h-11 px-3 py-2 bg-slate-950/50 border border-slate-700 rounded-md shadow-sm text-white font-mono text-sm break-all whitespace-pre-wrap resize-none overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:border-purple-500';

const COPIED_MS = 2000;

export function PartyShareModal({ isOpen, onClose, partyId, isGoogleHost }) {
  const [invite, setInvite] = useState(null); // { code, token }
  const [loadFailed, setLoadFailed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [codeCopyFailed, setCodeCopyFailed] = useState(false);
  const [linkCopyFailed, setLinkCopyFailed] = useState(false);
  const codeTimerRef = useRef(null);
  const linkTimerRef = useRef(null);
  const codeTextRef = useRef(null);
  const [rotateConfirming, setRotateConfirming] = useState(false);
  const [rotateFailed, setRotateFailed] = useState(false);
  const [rotateDone, setRotateDone] = useState(false);
  const [rotating, setRotating] = useState(false);
  const rotatingRef = useRef(false);
  const rotateCtaRef = useRef(null);
  const cancelRef = useRef(null);
  const copyCodeRef = useRef(null);
  const linkFieldRef = useRef(null);
  const focusCtaAfterCancelRef = useRef(false);
  const focusCopyAfterRotateRef = useRef(false);
  const titleId = useId();
  const introId = useId();
  const codeLabelId = useId();
  const helperId = useId();

  useEffect(
    () => () => {
      clearTimeout(codeTimerRef.current);
      clearTimeout(linkTimerRef.current);
    },
    []
  );

  const copyCode = async () => {
    if (!invite) return;
    clearTimeout(codeTimerRef.current);
    const ok = await copyText(formatPartyCode(invite.code));
    if (ok) {
      setCodeCopyFailed(false);
      setCodeCopied(true);
      codeTimerRef.current = setTimeout(() => setCodeCopied(false), COPIED_MS);
    } else {
      setCodeCopied(false);
      selectVisibleText(codeTextRef.current);
      setCodeCopyFailed(true);
    }
  };

  const link = invite ? buildPartyShareLink(window.location.origin, partyId, invite.token) : '';

  useEffect(() => {
    if (!isOpen || invite) return undefined;
    let cancelled = false;
    setLoadFailed(false);
    postPartyCode('share', { partyId }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.body?.code && res.body?.token) setInvite({ code: res.body.code, token: res.body.token });
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, invite, partyId]);

  useEffect(() => {
    if (rotateConfirming) cancelRef.current?.focus();
    else if (focusCtaAfterCancelRef.current) {
      focusCtaAfterCancelRef.current = false;
      rotateCtaRef.current?.focus();
    }
  }, [rotateConfirming]);

  useEffect(() => {
    if (rotateDone && focusCopyAfterRotateRef.current) {
      focusCopyAfterRotateRef.current = false;
      copyCodeRef.current?.focus();
    }
  }, [rotateDone, invite]);

  useEffect(() => {
    if (!rotateConfirming || rotating) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        focusCtaAfterCancelRef.current = true;
        setRotateConfirming(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [rotateConfirming, rotating]);

  useEffect(() => {
    const el = linkFieldRef.current;
    if (!isOpen || !el) return undefined;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [isOpen, link]);

  const copyLink = async () => {
    if (!invite) return;
    clearTimeout(linkTimerRef.current);
    const ok = await copyText(link);
    if (ok) {
      setLinkCopyFailed(false);
      setLinkCopied(true);
      linkTimerRef.current = setTimeout(() => setLinkCopied(false), COPIED_MS);
    } else {
      setLinkCopied(false);
      selectVisibleText(linkFieldRef.current);
      setLinkCopyFailed(true);
    }
  };

  const close = () => {
    setCodeCopied(false);
    setLinkCopied(false);
    setCodeCopyFailed(false);
    setLinkCopyFailed(false);
    setRotateConfirming(false);
    setRotateFailed(false);
    setRotateDone(false);
    setLoadFailed(false);
    onClose();
  };

  const performRotate = async () => {
    if (rotatingRef.current || !invite) return;
    rotatingRef.current = true;
    setRotating(true);
    setRotateFailed(false);
    const res = await postPartyCode('rotate', { partyId });
    if (res.ok && res.body?.code && res.body?.token) {
      setInvite({ code: res.body.code, token: res.body.token });
      setCodeCopied(false);
      setLinkCopied(false);
      setCodeCopyFailed(false);
      setLinkCopyFailed(false);
      setRotateConfirming(false);
      focusCopyAfterRotateRef.current = true;
      setRotateDone(true);
    } else {
      setRotateConfirming(false);
      setRotateDone(false);
      setRotateFailed(true);
    }
    rotatingRef.current = false;
    setRotating(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={COPY['host.share.title']}
      titleId={titleId}
      bodyClassName="px-4 py-4 sm:px-6"
    >
      <div className="space-y-4">
        <p id={introId} className="text-sm text-slate-300">
          {COPY['host.share.intro']}
        </p>

        <div className="space-y-2">
          <p id={codeLabelId} className="text-sm font-medium text-slate-300">
            {COPY['host.share.code.label']}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <p
              ref={codeTextRef}
              data-testid="share-party-code"
              className="sm:flex-1 font-mono text-[32px] leading-tight tracking-[0.1em] whitespace-nowrap text-white select-all min-h-11"
            >
              {invite ? formatPartyCode(invite.code) : ''}
            </p>
            <Button
              ref={copyCodeRef}
              aria-label={COPY['host.share.code.copy_name']}
              disabled={!invite}
              onClick={copyCode}
              className="w-full sm:w-auto min-h-11 whitespace-nowrap"
            >
              {codeCopied ? COPY['host.share.code.copy_done'] : COPY['host.share.code.copy']}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {codeCopied ? COPY['host.share.code.copy_status'] : ''}
          </p>
          <p
            data-testid="share-code-copy-failed"
            aria-live="polite"
            className={codeCopyFailed ? 'text-xs text-amber-200' : 'sr-only'}
          >
            {codeCopyFailed ? COPY['host.share.copy_failed'] : ''}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-start">
            <textarea
              ref={linkFieldRef}
              readOnly
              value={link}
              aria-labelledby={titleId}
              aria-describedby={introId}
              className={`sm:flex-1 ${SHARE_LINK_FIELD_CLASSES}`}
            />
            <Button
              aria-label={COPY['host.share.link.copy_name']}
              variant={linkCopied ? 'secondary' : 'primary'}
              disabled={!invite}
              onClick={copyLink}
              className="w-full min-h-11 sm:w-auto whitespace-nowrap"
            >
              {linkCopied ? COPY['host.share.link.copy_done'] : COPY['host.share.link.copy']}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {linkCopied ? COPY['host.share.link.copy_status'] : ''}
          </p>
          <p
            data-testid="share-link-copy-failed"
            aria-live="polite"
            className={linkCopyFailed ? 'text-xs text-amber-200' : 'sr-only'}
          >
            {linkCopyFailed ? COPY['host.share.copy_failed'] : ''}
          </p>
        </div>

        {loadFailed && !invite && (
          <p role="alert" className="text-sm text-red-300">
            {HOST_SHARE_LOAD_FAILED}
          </p>
        )}

        {isGoogleHost && (
          <div className="space-y-2 pt-1">
            {rotateFailed ? (
              <div className="flex flex-wrap items-center gap-2">
                <p role="alert" className="text-sm text-red-300 flex-1 min-w-[12rem]">
                  {HOST_INVITE_ROTATE_FAILED}
                </p>
                <button
                  type="button"
                  disabled={rotating}
                  aria-busy={rotating || undefined}
                  onClick={performRotate}
                  className={`inline-flex items-center justify-center min-h-11 min-w-11 px-4 py-2 rounded-md font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 ${FOCUS_RING}`}
                >
                  {HOST_INVITE_ROTATE_RETRY}
                </button>
              </div>
            ) : rotateConfirming ? (
              <>
                <p id={helperId} className="text-sm text-amber-200">
                  {HOST_INVITE_ROTATE_HELPER}
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <button
                    type="button"
                    aria-describedby={helperId}
                    disabled={rotating}
                    aria-busy={rotating || undefined}
                    onClick={performRotate}
                    className={`inline-flex items-center justify-center min-h-11 min-w-11 flex-1 px-4 py-2 rounded-md font-medium transition-colors border border-red-500 bg-transparent text-red-400 hover:bg-red-950/40 disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    {HOST_INVITE_ROTATE_CONFIRM}
                  </button>
                  <button
                    ref={cancelRef}
                    type="button"
                    disabled={rotating}
                    onClick={() => {
                      if (rotatingRef.current) return;
                      focusCtaAfterCancelRef.current = true;
                      setRotateConfirming(false);
                    }}
                    className={`inline-flex items-center justify-center min-h-11 min-w-11 flex-1 px-4 py-2 rounded-md font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  ref={rotateCtaRef}
                  type="button"
                  aria-describedby={helperId}
                  disabled={!invite}
                  onClick={() => {
                    setRotateDone(false);
                    setRotateFailed(false);
                    setRotateConfirming(true);
                  }}
                  className={`inline-flex items-center justify-center min-h-11 min-w-11 w-full px-4 py-2 rounded-md font-medium transition-colors bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100 disabled:opacity-50 ${FOCUS_RING}`}
                >
                  {HOST_INVITE_ROTATE_CTA}
                </button>
                <p id={helperId} className="text-sm text-slate-400">
                  {HOST_INVITE_ROTATE_HELPER}
                </p>
              </>
            )}
            {rotateDone && (
              <p role="status" aria-live="polite" className="text-sm text-green-400">
                {HOST_INVITE_ROTATE_DONE}
              </p>
            )}
          </div>
        )}

        <div className="pt-2">
          <Button variant="secondary" onClick={close} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
