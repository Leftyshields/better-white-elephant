/**
 * Preview-only Firebase wiring (emulators for local dev). Imported only when UX_PREVIEW_ENABLED is true.
 */
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { auth, db } from '../utils/firebase.js';

let initialized = false;

export function initPreviewFirebase() {
  if (initialized) return;
  initialized = true;

  const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
  if (!useEmulators) {
    return;
  }

  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}
