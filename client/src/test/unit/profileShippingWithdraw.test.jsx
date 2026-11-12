import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from '../../pages/Profile.jsx';
import { deleteField } from 'firebase/firestore';
import {
  PROFILE_SAVE_SUCCESS_MESSAGE,
  SHIPPING_ADDRESS_CONSENT_REQUIRED_ADDRESS_MODAL,
  SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE,
  SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION_PROFILE,
  SHIPPING_ADDRESS_DELETE_CONFIRM_PROFILE,
  SHIPPING_ADDRESS_DELETE_SUCCESS_PROFILE,
  SHIPPING_ADDRESS_INCOMPLETE_PROFILE,
  SHIPPING_ADDRESS_INCOMPLETE_SHARE_OFF_PROFILE,
  SHIPPING_ADDRESS_SAVE_UNCHECKED_SUCCESS_PROFILE,
  SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE,
} from '../../utils/shippingAddressCopy.js';

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

  it('never shows consent-required must-agree copy on Profile', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: undefined });
    await renderProfile();
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(screen.queryByText(SHIPPING_ADDRESS_CONSENT_REQUIRED_ADDRESS_MODAL)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByText(SHIPPING_ADDRESS_CONSENT_REQUIRED_ADDRESS_MODAL)).not.toBeInTheDocument();
  });

  it('allows unchecking consent and Save; removes stored consent', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: new Date() });
    await renderProfile();

    const consentBox = await screen.findByRole('checkbox');
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(consentBox);
    expect(consentBox).not.toBeChecked();
    expect(screen.getByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).toBeInTheDocument();
    expect(screen.queryByText(SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE)).not.toBeInTheDocument();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.shippingAddress).toEqual(completeAddress);
    expect(payload.shippingAddressSenderShareConsentAt).toEqual(deleteField());

    await waitFor(() => {
      expect(screen.getByText(SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE)).toBeInTheDocument();
    });
    expect(screen.queryByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).not.toBeInTheDocument();
    expect(screen.getByText(SHIPPING_ADDRESS_SAVE_UNCHECKED_SUCCESS_PROFILE)).toBeInTheDocument();
  });

  it('does not show withdraw-pending when consent was never saved (check then uncheck)', async () => {
    mockLoadedProfile({ address: undefined, consentAt: undefined });
    await renderProfile();

    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: completeAddress.name } });
    fireEvent.change(screen.getByPlaceholderText('123 Main St'), { target: { value: completeAddress.street } });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: completeAddress.city } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: completeAddress.state } });
    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: completeAddress.zip } });
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: completeAddress.country } });

    const consentBox = await screen.findByRole('checkbox');
    fireEvent.click(consentBox);
    fireEvent.click(consentBox);

    expect(screen.queryByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).not.toBeInTheDocument();
  });

  it('shows withdraw-pending after save with consent then uncheck before next save', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: undefined });
    await renderProfile();

    const consentBox = await screen.findByRole('checkbox');
    fireEvent.click(consentBox);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText(SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE)).not.toBeInTheDocument();
    });

    fireEvent.click(consentBox);
    expect(screen.getByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).toBeInTheDocument();
  });

  it('shows withdraw-pending note after uncheck and hides it when consent is re-checked before save', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: new Date() });
    await renderProfile();

    const consentBox = await screen.findByRole('checkbox');
    fireEvent.click(consentBox);
    expect(screen.getByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).toBeInTheDocument();

    fireEvent.click(consentBox);
    expect(screen.queryByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).not.toBeInTheDocument();
  });

  it('shows saved-needs-consent note for persisted address without consent and not withdraw-pending', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: undefined });
    await renderProfile();

    expect(screen.getByText(SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE)).toBeInTheDocument();
    expect(screen.queryByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).not.toBeInTheDocument();
  });

  it('clears saved-needs-consent note after save with consent checked', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: undefined });
    await renderProfile();

    expect(screen.getByText(SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE)).toBeInTheDocument();
    const consentBox = await screen.findByRole('checkbox');
    fireEvent.click(consentBox);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText(SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE)).not.toBeInTheDocument();
    });
  });

  it('shows delete confirm when all fields cleared; deletes only after confirm', async () => {
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

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(SHIPPING_ADDRESS_DELETE_CONFIRM_PROFILE)).toBeInTheDocument();
    });
    expect(updateDoc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION_PROFILE }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.shippingAddress).toEqual(deleteField());
    expect(payload.shippingAddressSenderShareConsentAt).toEqual(deleteField());
    expect(screen.getByText(SHIPPING_ADDRESS_DELETE_SUCCESS_PROFILE)).toBeInTheDocument();
  });

  it('cancel on delete confirm does not delete the address', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: new Date() });
    await renderProfile();

    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('123 Main St'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText(SHIPPING_ADDRESS_DELETE_CONFIRM_PROFILE);

    const cancelButtons = screen.getAllByRole('button', { name: /^cancel$/i });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('incomplete saved address without consent change does not call updateDoc', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: new Date() });
    await renderProfile();

    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(SHIPPING_ADDRESS_INCOMPLETE_PROFILE)).toBeInTheDocument();
    });
    expect(screen.queryByText(SHIPPING_ADDRESS_INCOMPLETE_SHARE_OFF_PROFILE)).not.toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('incomplete address with consent withdraw persists deleteField for consent only', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: new Date() });
    await renderProfile();

    const consentBox = await screen.findByRole('checkbox');
    fireEvent.click(consentBox);
    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.shippingAddressSenderShareConsentAt).toEqual(deleteField());
    expect(payload.shippingAddress).toBeUndefined();

    expect(screen.getByText(SHIPPING_ADDRESS_INCOMPLETE_SHARE_OFF_PROFILE)).toBeInTheDocument();
    expect(screen.queryByText(SHIPPING_ADDRESS_INCOMPLETE_PROFILE)).not.toBeInTheDocument();
    expect(screen.queryByText(SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE)).not.toBeInTheDocument();
    expect(screen.queryByText(SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(completeAddress.zip)).toBeInTheDocument();
  });

  it('same session: save new address then clear all fields shows confirm and deletes', async () => {
    mockLoadedProfile({ address: undefined, consentAt: undefined });
    await renderProfile();

    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: completeAddress.name } });
    fireEvent.change(screen.getByPlaceholderText('123 Main St'), { target: { value: completeAddress.street } });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: completeAddress.city } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: completeAddress.state } });
    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: completeAddress.zip } });
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: completeAddress.country } });

    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    updateDoc.mockClear();

    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('123 Main St'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(SHIPPING_ADDRESS_DELETE_CONFIRM_PROFILE)).toBeInTheDocument();
    });
    expect(updateDoc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION_PROFILE }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.shippingAddress).toEqual(deleteField());
    expect(payload.shippingAddressSenderShareConsentAt).toEqual(deleteField());
  });

  it('shows default success message on save with consent checked', async () => {
    mockLoadedProfile({ address: completeAddress, consentAt: undefined });
    await renderProfile();

    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });
    expect(screen.getByText(PROFILE_SAVE_SUCCESS_MESSAGE)).toBeInTheDocument();
  });

  it('shows unchecked-address success on first complete save without consent', async () => {
    mockLoadedProfile({ address: undefined, consentAt: undefined });
    await renderProfile();

    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: completeAddress.name } });
    fireEvent.change(screen.getByPlaceholderText('123 Main St'), { target: { value: completeAddress.street } });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: completeAddress.city } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: completeAddress.state } });
    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: completeAddress.zip } });
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: completeAddress.country } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });
    expect(screen.getByText(SHIPPING_ADDRESS_SAVE_UNCHECKED_SUCCESS_PROFILE)).toBeInTheDocument();
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
