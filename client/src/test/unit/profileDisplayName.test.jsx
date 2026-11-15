import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from '../../pages/Profile.jsx';
import {
  PROFILE_DISPLAY_NAME_EMAIL_ERROR,
  PROFILE_DISPLAY_NAME_ERROR_ID,
  PROFILE_DISPLAY_NAME_HELPER,
  PROFILE_DISPLAY_NAME_HELPER_ID,
  PROFILE_DISPLAY_NAME_INPUT_ID,
  PROFILE_DISPLAY_NAME_PLACEHOLDER,
} from '../../utils/profileDisplayNameCopy.js';
import { PROFILE_SAVE_SUCCESS_MESSAGE } from '../../utils/shippingAddressCopy.js';

const { updateDoc, getDoc, setDoc, mockUser, updateProfile } = vi.hoisted(() => ({
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateProfile: vi.fn(),
  mockUser: {
    uid: 'user-1',
    email: 'user@example.com',
    displayName: 'Google Person',
  },
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doc: (...args) => ({ path: args.join('/') }),
    getDoc,
    updateDoc,
    setDoc,
    deleteField: actual.deleteField,
  };
});

vi.mock('firebase/auth', () => ({
  updateProfile,
  auth: { currentUser: { uid: 'user-1' } },
}));

vi.mock('../../utils/firebase.js', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  db: {},
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    MemoryRouter: actual.MemoryRouter,
  };
});

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

function mockLoadedProfile(userData) {
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => userData,
  });
}

async function renderProfile() {
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText('Your Profile')).toBeInTheDocument();
  });
}

describe('Profile display name', () => {
  beforeEach(() => {
    updateDoc.mockReset();
    getDoc.mockReset();
    setDoc.mockReset();
    updateProfile.mockReset();
    updateDoc.mockResolvedValue(undefined);
    updateProfile.mockResolvedValue(undefined);
    mockUser.displayName = 'Google Person';
  });

  it('shows Copywriter placeholder and helper, not email in the field', async () => {
    mockLoadedProfile({ displayName: 'Google Person' });
    await renderProfile();

    const nameInput = screen.getByPlaceholderText(PROFILE_DISPLAY_NAME_PLACEHOLDER);
    expect(nameInput).toHaveAttribute('placeholder', PROFILE_DISPLAY_NAME_PLACEHOLDER);
    expect(screen.getByText(PROFILE_DISPLAY_NAME_HELPER)).toBeInTheDocument();
    expect(nameInput).not.toHaveValue('user@example.com');
  });

  it('clears Google-sourced name on save and writes empty to Auth and Firestore', async () => {
    mockLoadedProfile({ displayName: 'Google Person' });
    await renderProfile();

    const nameInput = screen.getByPlaceholderText(PROFILE_DISPLAY_NAME_PLACEHOLDER);
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith(expect.anything(), { displayName: null });
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.displayName).toBe('');

    await waitFor(() => {
      expect(nameInput).toHaveValue('');
    });

    await waitFor(() => {
      expect(screen.getByText(PROFILE_SAVE_SUCCESS_MESSAGE)).toBeInTheDocument();
    });
  });

  it.each(['a@b.com', 'Alex @ Home'])(
    'rejects %s with inline error and writes nothing',
    async (badName) => {
      mockLoadedProfile({ displayName: 'Pat' });
      await renderProfile();

      const nameInput = screen.getByPlaceholderText(PROFILE_DISPLAY_NAME_PLACEHOLDER);
      fireEvent.change(nameInput, { target: { value: badName } });
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(PROFILE_DISPLAY_NAME_EMAIL_ERROR)).toBeInTheDocument();
      });
      expect(updateProfile).not.toHaveBeenCalled();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(screen.queryByText(PROFILE_SAVE_SUCCESS_MESSAGE)).not.toBeInTheDocument();
    },
  );

  it('exposes a11y attributes and focuses input when @ name is blocked', async () => {
    mockLoadedProfile({ displayName: 'Pat' });
    await renderProfile();

    const nameInput = screen.getByPlaceholderText(PROFILE_DISPLAY_NAME_PLACEHOLDER);
    expect(nameInput).toHaveAttribute('id', PROFILE_DISPLAY_NAME_INPUT_ID);
    expect(nameInput).toHaveAttribute('aria-describedby', PROFILE_DISPLAY_NAME_HELPER_ID);

    fireEvent.change(nameInput, { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput).toHaveAttribute(
        'aria-describedby',
        `${PROFILE_DISPLAY_NAME_HELPER_ID} ${PROFILE_DISPLAY_NAME_ERROR_ID}`,
      );
      expect(document.getElementById(PROFILE_DISPLAY_NAME_ERROR_ID)).toHaveTextContent(
        PROFILE_DISPLAY_NAME_EMAIL_ERROR,
      );
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(nameInput);
    });
  });

  it('saves a normal display name', async () => {
    mockLoadedProfile({ displayName: '' });
    await renderProfile();

    const nameInput = screen.getByPlaceholderText(PROFILE_DISPLAY_NAME_PLACEHOLDER);
    fireEvent.change(nameInput, { target: { value: 'Pat' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });
    expect(updateProfile).toHaveBeenCalledWith(expect.anything(), { displayName: 'Pat' });
    expect(updateDoc.mock.calls[0][1].displayName).toBe('Pat');
  });
});