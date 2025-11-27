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
import { auth } from '../utils/firebase.js';
import { trackLogin, trackSignUp } from '../utils/analytics.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
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

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
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
      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
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


