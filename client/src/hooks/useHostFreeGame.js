/**
 * Shared host / create-party entry (hero, rules CTA). Sign-in runs only from user activation.
 */
import { useCallback } from 'react';
import { useAuth } from './useAuth.js';
import { usePartyModal } from '../contexts/PartyModalContext.jsx';
import { trackButtonClick } from '../utils/analytics.js';
import { LANDING_COPY } from '../utils/landingMarketingCopy.js';

export const OPEN_CREATE_PARTY_AFTER_AUTH_KEY = 'openCreatePartyAfterAuth';
export const PENDING_HOST_CTA_KEY = 'pendingHostCtaSource';

/** Clears host CTA session flag when Google sign-in did not complete (popup dismissed, etc.). */
export function clearOpenCreatePartyAfterAuthUnlessGoogleSignInSucceeded(signInResult) {
  if (!signInResult?.success) {
    window.sessionStorage.removeItem(OPEN_CREATE_PARTY_AFTER_AUTH_KEY);
  }
}

export function hostSignInUserMessage(error) {
  const message = typeof error === 'string' ? error : error?.message ?? '';
  if (message.includes('popup-blocked') || message.includes('cancelled-popup')) {
    return 'We could not open the Google sign-in window. Allow popups for this site, then try Host a free game again.';
  }
  if (message) {
    return 'Sign-in did not complete. Try Host a free game again.';
  }
  return 'Sign-in did not complete. Try Host a free game again.';
}

export function focusHostHeroCta(buttonEl) {
  window.scrollTo(0, 0);
  if (!buttonEl) {
    return;
  }
  requestAnimationFrame(() => {
    if (typeof buttonEl.scrollIntoView === 'function') {
      buttonEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (typeof buttonEl.focus === 'function') {
      buttonEl.focus({ preventScroll: true });
    }
  });
}

export function useHostFreeGame() {
  const { user, signInWithGoogle, loading: authLoading } = useAuth();
  const { setShowModal: setShowCreatePartyModal, hostSignInNotice, setHostSignInNotice } = usePartyModal();

  const dismissHostSignInNotice = useCallback(() => setHostSignInNotice(''), [setHostSignInNotice]);

  const handleHostFreeGame = useCallback(
    async (analyticsSource = 'hero') => {
      setHostSignInNotice('');
      trackButtonClick(LANDING_COPY.primaryCta, analyticsSource);

      if (authLoading) {
        return { skipped: 'auth_loading' };
      }

      if (user) {
        setShowCreatePartyModal(true);
        return { skipped: null };
      }

      window.sessionStorage.setItem(OPEN_CREATE_PARTY_AFTER_AUTH_KEY, '1');
      const res = await signInWithGoogle();
      if (!res?.success) {
        if (res?.error) {
          console.error('Sign in failed:', res.error);
          setHostSignInNotice(hostSignInUserMessage(res.error));
        }
        clearOpenCreatePartyAfterAuthUnlessGoogleSignInSucceeded(res);
      }
      return { skipped: null, signInResult: res };
    },
    [authLoading, setHostSignInNotice, signInWithGoogle, setShowCreatePartyModal, user],
  );

  const queueHostCtaFromRules = useCallback(
    (analyticsSource = 'rules_cta') => {
      if (authLoading) {
        return false;
      }
      window.sessionStorage.setItem(PENDING_HOST_CTA_KEY, analyticsSource);
      return true;
    },
    [authLoading],
  );

  return {
    authLoading,
    dismissHostSignInNotice,
    handleHostFreeGame,
    hostSignInNotice,
    queueHostCtaFromRules,
    user,
  };
}
