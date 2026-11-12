/**
 * Shared host / create-party entry (hero, rules CTA). Sign-in runs only from user activation.
 */
import { useCallback, useState } from 'react';
import { useAuth } from './useAuth.js';
import { usePartyModal } from '../contexts/PartyModalContext.jsx';
import { trackButtonClick } from '../utils/analytics.js';
import { LANDING_COPY } from '../utils/landingMarketingCopy.js';

export const OPEN_CREATE_PARTY_AFTER_AUTH_KEY = 'openCreatePartyAfterAuth';

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

export function useHostFreeGame() {
  const { user, signInWithGoogle, loading: authLoading } = useAuth();
  const { setShowModal: setShowCreatePartyModal } = usePartyModal();
  const [hostSignInNotice, setHostSignInNotice] = useState('');

  const handleHostFreeGame = useCallback(
    async (analyticsSource = 'hero') => {
      setHostSignInNotice('');
      trackButtonClick(LANDING_COPY.primaryCta, analyticsSource);

      if (authLoading) {
        return;
      }

      if (user) {
        setShowCreatePartyModal(true);
        return;
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
    },
    [authLoading, signInWithGoogle, setShowCreatePartyModal, user],
  );

  const dismissHostSignInNotice = useCallback(() => setHostSignInNotice(''), []);

  return {
    authLoading,
    dismissHostSignInNotice,
    handleHostFreeGame,
    hostSignInNotice,
    user,
  };
}
