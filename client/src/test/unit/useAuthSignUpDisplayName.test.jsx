import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../../hooks/useAuth.js';
import { PROFILE_DISPLAY_NAME_EMAIL_ERROR } from '../../utils/profileDisplayNameCopy.js';

const { createUserWithEmailAndPassword, updateProfile } = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback(null);
    return () => {};
  },
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithEmailLink: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: vi.fn(),
}));

vi.mock('../../utils/firebase.js', () => ({
  auth: {},
  db: {},
}));

vi.mock('../../utils/analytics.js', () => ({
  trackLogin: vi.fn(),
  trackSignUp: vi.fn(),
}));

describe('useAuth signUpWithEmailAndPassword display name', () => {
  beforeEach(() => {
    createUserWithEmailAndPassword.mockReset();
    updateProfile.mockReset();
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'new-user' } });
    updateProfile.mockResolvedValue(undefined);
  });

  it('rejects display names containing @ before Firebase signup', async () => {
    const { result } = renderHook(() => useAuth());

    let response;
    await act(async () => {
      response = await result.current.signUpWithEmailAndPassword(
        'new@example.com',
        'password123',
        'bad@name',
      );
    });

    expect(response).toEqual({ success: false, error: PROFILE_DISPLAY_NAME_EMAIL_ERROR });
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('allows signup with a normal display name', async () => {
    const { result } = renderHook(() => useAuth());

    let response;
    await act(async () => {
      response = await result.current.signUpWithEmailAndPassword(
        'new@example.com',
        'password123',
        'River',
      );
    });

    expect(response.success).toBe(true);
    expect(createUserWithEmailAndPassword).toHaveBeenCalled();
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'new-user' }),
      { displayName: 'River' },
    );
  });
});