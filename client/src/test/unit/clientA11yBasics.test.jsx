import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from '../../pages/Profile.jsx';

const clientSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');

const { getDoc, mockUser } = vi.hoisted(() => ({
  getDoc: vi.fn(),
  mockUser: {
    uid: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
  },
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doc: (...args) => ({ path: args.join('/') }),
    getDoc,
    updateDoc: vi.fn(),
    setDoc: vi.fn(),
    deleteField: actual.deleteField,
  };
});

vi.mock('firebase/auth', () => ({
  updateProfile: vi.fn(),
  auth: { currentUser: { uid: 'user-1' } },
}));

vi.mock('../../utils/firebase.js', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  db: {},
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

describe('shared UI a11y classes', () => {
  const inputSource = readFileSync(join(clientSrc, 'components/ui/Input.jsx'), 'utf8');
  const buttonSource = readFileSync(join(clientSrc, 'components/ui/Button.jsx'), 'utf8');
  const partyManagement = readFileSync(join(clientSrc, 'components/PartyManagement.jsx'), 'utf8');

  it('Input links labels with htmlFor, shows keyboard focus ring, and lighter placeholders', () => {
    expect(inputSource).toContain('htmlFor={inputId}');
    expect(inputSource).toContain('focus-visible:ring-2');
    expect(inputSource).toContain('focus-visible:ring-purple-500');
    expect(inputSource).toContain('placeholder:text-slate-400');
    expect(inputSource).toContain('min-h-11');
  });

  it('Button meets 44px minimum height and keyboard focus ring', () => {
    expect(buttonSource).toContain('min-h-11');
    expect(buttonSource).toContain('focus-visible:ring-2');
    expect(buttonSource).toContain('focus-visible:ring-purple-500');
  });

  it('Party Management status selects meet minimum tap height', () => {
    expect(partyManagement).toMatch(/<select[\s\S]*min-h-11/);
    expect(partyManagement).toContain('placeholder:text-slate-400');
  });
});

describe('Profile page label associations', () => {
  beforeEach(() => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'User',
      }),
    });
  });

  it('associates the read-only email field with its label', async () => {
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('id', 'profile-email');
    expect(email).toBeDisabled();

    const displayName = screen.getByLabelText('Display Name');
    expect(displayName).toHaveAttribute('id', 'profile-display-name');
    expect(displayName.className).toMatch(/focus-visible:ring-2/);
  });
});