/**
 * Host-only party code + invite link: one shared fetch (postPartyCode share)
 * and clipboard helpers used by the share modal and the setup-step inline block.
 */
import { useEffect, useRef, useState } from 'react';
import { postPartyCode } from '../utils/api.js';
import { buildPartyShareLink } from '../utils/partyInvite.js';
import { copyText, selectVisibleText } from '../utils/copyText.js';

export const SHARE_COPIED_MS = 2000;

/**
 * Load the host-only party code and token.
 * @param {{ partyId?: string, enabled?: boolean }} args
 */
export function usePartyShareInvite({ partyId, enabled = true } = {}) {
  const [invite, setInvite] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setInvite(null);
    setLoadFailed(false);
  }, [partyId]);

  useEffect(() => {
    if (!enabled || !partyId || invite) return undefined;
    let cancelled = false;
    setLoadFailed(false);
    postPartyCode('share', { partyId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.body?.code && res.body?.token) {
          setInvite({ code: res.body.code, token: res.body.token });
        } else {
          setLoadFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, invite, partyId]);

  const link =
    invite && partyId && typeof window !== 'undefined'
      ? buildPartyShareLink(window.location.origin, partyId, invite.token)
      : '';

  return { invite, setInvite, loadFailed, setLoadFailed, link };
}

/** Per-surface copy state so the modal and the inline block do not share refs. */
export function useShareClipboard() {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [codeCopyFailed, setCodeCopyFailed] = useState(false);
  const [linkCopyFailed, setLinkCopyFailed] = useState(false);
  const codeTimerRef = useRef(null);
  const linkTimerRef = useRef(null);
  const codeTextRef = useRef(null);
  const linkFieldRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(codeTimerRef.current);
      clearTimeout(linkTimerRef.current);
    },
    [],
  );

  const resetCopyState = () => {
    clearTimeout(codeTimerRef.current);
    clearTimeout(linkTimerRef.current);
    setCodeCopied(false);
    setLinkCopied(false);
    setCodeCopyFailed(false);
    setLinkCopyFailed(false);
  };

  const copyCode = async (formattedCode) => {
    if (!formattedCode) return;
    clearTimeout(codeTimerRef.current);
    const ok = await copyText(formattedCode);
    if (ok) {
      setCodeCopyFailed(false);
      setCodeCopied(true);
      codeTimerRef.current = setTimeout(() => setCodeCopied(false), SHARE_COPIED_MS);
    } else {
      setCodeCopied(false);
      selectVisibleText(codeTextRef.current);
      setCodeCopyFailed(true);
    }
  };

  const copyLink = async (shareLink) => {
    if (!shareLink) return;
    clearTimeout(linkTimerRef.current);
    const ok = await copyText(shareLink);
    if (ok) {
      setLinkCopyFailed(false);
      setLinkCopied(true);
      linkTimerRef.current = setTimeout(() => setLinkCopied(false), SHARE_COPIED_MS);
    } else {
      setLinkCopied(false);
      selectVisibleText(linkFieldRef.current);
      setLinkCopyFailed(true);
    }
  };

  return {
    codeCopied,
    linkCopied,
    codeCopyFailed,
    linkCopyFailed,
    codeTextRef,
    linkFieldRef,
    copyCode,
    copyLink,
    resetCopyState,
  };
}
