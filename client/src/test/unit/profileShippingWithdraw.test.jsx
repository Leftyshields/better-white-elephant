import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from '../../pages/Profile.jsx';
import { deleteField } from 'firebase/firestore';

const { updateDoc, getDoc, setDoc, mockUser } = vi.hoisted(() => ({
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
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
    updateDoc,
    setDoc,
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

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    MemoryRouter: actual.MemoryRouter,
    Routes: actual.Routes,
    Route: actual.Route,
  };
});

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

const completeAddress = {
  name: 'Pat Lee',
  street: '9 Oak Ave',
  city: 'Town',
  state: 'TX',
  zip: '75001',
  country: 'US',
};

function mockLoadedProfile({ address, consentAt } = {}) {
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({
      displayName: 'User',
      shippingAddress: address,
      shippingAddressSenderShareConsentAt: consentAt,
    }),
  });
}

async function renderProfile() {
  const view = render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText('Your Profile')).toBeInTheDocument();
  });
  return view;
}

describe('Profile consent withdrawal and address deletion', () => {
  beforeEach(() => {
    updateDoc.mockReset();
    getDoc.mockReset();
    setDoc.mockReset();
    updateDoc.mockResolvedValue(undefined);
    setDoc.mockResolvedValue(undefined);
  });

  it('allows unchecking consent and Save; removes stored consent', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: new Date() });
    await renderProfile();

    const consentBox = await screen.findByRole('checkbox');
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(consentBox);
    expect(consentBox).not.toBeChecked();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.shippingAddress).toEqual(completeAddress);
    expect(payload.shippingAddressSenderShareConsentAt).toEqual(deleteField());
  });

  it('allows clearing address fields and Save; deletes stored address', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: new Date() });
    await renderProfile();

    await screen.findByRole('checkbox');
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('123 Main St'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: '' } });

    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.shippingAddress).toEqual(deleteField());
    expect(payload.shippingAddressSenderShareConsentAt).toEqual(deleteField());
  });

  it('keeps Save enabled for display-name-only when address fields are empty', async () => {
    mockLoadedProfile({ address: undefined, consentAt: undefined });
    await renderProfile();

    const consentBox = await screen.findByRole('checkbox');
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(consentBox).not.toBeChecked();
    expect(saveButton).not.toBeDisabled();

    fireEvent.change(screen.getByDisplayValue('User'), { target: { value: 'New Name' } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.displayName).toBe('New Name');
    expect(payload.shippingAddress).toBeUndefined();
  });

  it('missing user document (exists() false) loads without crash and creates profile doc', async () => {
    getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });
    await renderProfile();

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalled();
    });
    expect(screen.getByText('Your Profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
  });
});
