/**
 * Home "Join a party" box (party-code spec Rev 4). One field, liberal at parse (case, spaces,
 * dashes, dropped characters with a polite hint), strict at meaning (exactly 8 alphabet characters,
 * server decides). A pasted /party/ link is routed as a link. A paste that yields a full code
 * submits once; typing the 8th character does not. Errors are inline; no alert().
 */
import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { postPartyCode } from '../utils/api.js';
import {
  PARTY_CODE_DISPLAY_MAXLENGTH,
  formatPartyCode,
  isCompletePartyCode,
  normalizePartyCodeInput,
  partyLinkPathFromText,
} from '../utils/partyCode.js';
import { PARTY_INVITE_COPY as COPY } from '../utils/partyInviteCopy.js';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

export function JoinPartyBox({ className = '' }) {
  const navigate = useNavigate();
  const { ensureGuestSession } = useAuth();
  const [code, setCode] = useState('');
  const [hint, setHint] = useState(false);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const inputRef = useRef(null);
  const ids = { title: useId(), input: useId(), helper: useId(), hint: useId(), error: useId() };

  const submit = async (value) => {
    if (checkingRef.current) return;
    if (!isCompletePartyCode(value)) {
      setError(COPY['home.join.error.format']);
      return;
    }
    checkingRef.current = true;
    setChecking(true);
    setError(null);
    let res;
    try {
      await ensureGuestSession();
      res = await postPartyCode('join', { code: value });
    } catch {
      res = { ok: false, status: 0, body: {} };
    }
    checkingRef.current = false;
    setChecking(false);
    if (res.ok && typeof res.body?.partyId === 'string') {
      navigate(`/party/${res.body.partyId}`);
      return;
    }
    setError(res.status === 409 && res.body?.error === 'full' ? COPY['home.join.error.full'] : COPY['home.join.error.generic']);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const apply = (raw) => {
    const next = normalizePartyCodeInput(raw);
    setCode(next.code);
    setHint(next.dropped);
    setError(null);
    return next.code;
  };

  const describedBy = [ids.helper, hint ? ids.hint : null, error ? ids.error : null].filter(Boolean).join(' ');

  return (
    <form
      aria-labelledby={ids.title}
      aria-busy={checking || undefined}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
      className={`w-full max-w-md mx-auto text-left bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl p-4 ${className}`}
    >
      <h2 id={ids.title} className="text-base font-semibold text-white">
        {COPY['home.join.title']}
      </h2>
      <p id={ids.helper} className="text-sm text-slate-300 mb-3">
        {COPY['home.join.helper']}
      </p>
      <label htmlFor={ids.input} className="block text-sm font-medium text-slate-200 mb-1">
        {COPY['home.join.label']}
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          ref={inputRef}
          id={ids.input}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={PARTY_CODE_DISPLAY_MAXLENGTH}
          placeholder={COPY['home.join.placeholder']}
          value={formatPartyCode(code)}
          disabled={checking}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          onChange={(e) => apply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isCompletePartyCode(code)) {
              e.preventDefault();
              setError(COPY['home.join.error.format']);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData?.getData('text') ?? '';
            e.preventDefault();
            const linkPath = partyLinkPathFromText(text);
            if (linkPath) {
              navigate(linkPath);
              return;
            }
            const pasted = apply(text);
            if (isCompletePartyCode(pasted)) submit(pasted);
            else setError(COPY['home.join.error.format']);
          }}
          className={`flex-1 min-h-11 px-3 py-2 text-base font-mono tracking-[0.1em] uppercase bg-slate-950/60 border border-slate-600 rounded-md text-white placeholder:text-slate-500 disabled:opacity-60 ${FOCUS_RING}`}
        />
        <button
          type="submit"
          disabled={!isCompletePartyCode(code) || checking}
          className={`min-h-11 min-w-11 px-5 py-2 rounded-md font-medium bg-white/10 border border-white/25 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
        >
          {COPY['home.join.cta']}
        </button>
      </div>
      {checking && (
        <p className="text-sm text-slate-300 mt-2" role="status">
          {COPY['home.join.checking']}
        </p>
      )}
      {hint && !error && (
        <p id={ids.hint} className="text-sm text-slate-300 mt-2" aria-live="polite">
          {COPY['home.join.hint.excluded']}
        </p>
      )}
      {error && (
        <p id={ids.error} role="alert" className="text-sm text-red-300 mt-2">
          {error}
        </p>
      )}
    </form>
  );
}
