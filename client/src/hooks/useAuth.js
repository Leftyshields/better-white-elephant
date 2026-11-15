/**
 * Firebase Authentication Hook
 */
import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailLink,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
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
  sanitizeUserChosenDisplayName,
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

  const signInWithEmailAndPasswordHandler = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signUpWithEmailAndPassword = async (email, password, displayName = null) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const safeDisplayName = sanitizeUserChosenDisplayName(displayName);
      if (safeDisplayName && result.user) {
        await updateProfile(result.user, { displayName: safeDisplayName });
      }
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
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
    signInWithEmailAndPassword: signInWithEmailAndPasswordHandler,
    signUpWithEmailAndPassword,
    signOut,
  };
}


