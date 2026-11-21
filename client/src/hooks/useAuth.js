/**
 * Firebase Authentication Hook
 */
import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailLink,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, db } from '../utils/firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { trackLogin, trackSignUp } from '../utils/analytics.js';
import {
  hostDisplayNameForPartyDoc,
  isValidPublicHostDisplayName,
  resolveSyncedFirestoreDisplayName,
} from '../../../server/lib/display-names.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
      
      // Sync user data to Firestore whenever user signs in
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          // Get current Firestore data to preserve shippingAddress if it exists
          const existingData = userDoc.exists() ? userDoc.data() : {};
          
          // Update or create user document with Auth data
          const syncedDisplayName = resolveSyncedFirestoreDisplayName(
            user.displayName,
            existingData.displayName,
          );
          await setDoc(userDocRef, {
            displayName: syncedDisplayName,
            email: user.email || existingData.email || '',
            // Preserve existing shippingAddress if it exists
            shippingAddress: existingData.shippingAddress || null,
            // Preserve createdAt if document exists, otherwise set it
            createdAt: existingData.createdAt || new Date(),
            updatedAt: new Date(),
          }, { merge: true });

          const hostDisplayName = hostDisplayNameForPartyDoc(
            user.uid,
            syncedDisplayName,
            user.email || existingData.email || '',
          );
          if (hostDisplayName != null && isValidPublicHostDisplayName(hostDisplayName)) {
            const hostedPartiesQuery = query(
              collection(db, 'parties'),
              where('adminId', '==', user.uid),
              where('status', 'in', ['LOBBY', 'CANCELLED']),
            );
            const hostedParties = await getDocs(hostedPartiesQuery);
            const partyUpdates = hostedParties.docs
              .filter((partyDoc) => partyDoc.data().hostDisplayName !== hostDisplayName)
              .map((partyDoc) =>
                updateDoc(partyDoc.ref, {
                  hostDisplayName,
                  updatedAt: new Date(),
                }),
              );
            const results = await Promise.allSettled(partyUpdates);
            for (const result of results) {
              if (result.status === 'rejected') {
                const error = result.reason;
                console.error('Error syncing hostDisplayName to party:', {
                  code: error?.code,
                  name: error?.name,
                });
              }
            }
          }
        } catch (error) {
          // Don't block auth flow if Firestore sync fails
          console.error('Error syncing user data to Firestore:', {
            code: error?.code,
            name: error?.name,
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmailLinkHandler = async (email, emailLink) => {
    try {
      const result = await signInWithEmailLink(auth, email, emailLink);
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // NOTE (item 3): when anonymous guests are enabled, a guest who later hosts must upgrade with
  // linkWithPopup(auth.currentUser, provider) so their uid (seat, gift, win) is kept. Calling
  // signInWithPopup here would switch them to a different uid.
  const signInWithGoogle = async (forceAccountSelection = false) => {
    try {
      const provider = new GoogleAuthProvider();
      // Always prompt for account selection to allow users to choose a different account
      // This is especially useful when joining a party with a different account
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      const result = await signInWithPopup(auth, provider);
      // Track login - check if this is a new user (first time sign in)
      const isNewUser = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
      if (isNewUser) {
        trackSignUp('google');
      } else {
        trackLogin('google');
      }
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  /**
   * Guests (invite link or party code) get a silent anonymous session, with no UI. An existing
   * session (a Google host joining someone else's party) is reused, never replaced.
   */
  const ensureGuestSession = async () => {
    if (auth.currentUser) return auth.currentUser;
    const result = await signInAnonymously(auth);
    return result.user;
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return {
    user,
    loading,
    signInWithEmailLink: signInWithEmailLinkHandler,
    signInWithGoogle,
    ensureGuestSession,
    signOut,
  };
}


