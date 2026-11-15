import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShippingAddressStep } from '../../components/lobby/ShippingAddressStep.jsx';
import { LOBBY_STEP_STATUS } from '../../components/lobby/lobbyStepUtils.js';

const { getDoc, updateDoc } = vi.hoisted(() => ({
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doc: (...args) => ({ path: args.join('/') }),
    getDoc,
    updateDoc,
    deleteField: actual.deleteField,
  };
});

vi.mock('../../utils/firebase.js', () => ({ db: {}, auth: {} }));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}));

const completeAddress = {
  name: 'Pat',
  street: '1 Main',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  country: 'US',
};

describe('ShippingAddressStep', () => {
  beforeEach(() => {
    getDoc.mockReset();
    updateDoc.mockReset();
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ shippingAddress: completeAddress }),
    });
    updateDoc.mockResolvedValue(undefined);
  });

  it('renders consent as text without a checkbox', async () => {
    render(
      <ShippingAddressStep
        stepStatus={LOBBY_STEP_STATUS.ACTIVE}
        headingId="lobby-step-heading-address"
        savedAddress={null}
        isEditing={false}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/City/i)).toHaveValue('Austin');
    });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Only the person picked to ship you a gift/i)).toBeInTheDocument();
  });

  it('shows city-only summary when done', async () => {
    render(
      <ShippingAddressStep
        stepStatus={LOBBY_STEP_STATUS.DONE}
        headingId="lobby-step-heading-address"
        savedAddress={completeAddress}
        isEditing={false}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lobby-address-summary')).toHaveTextContent('Shipping to Austin');
    });
  });

  it('persists address to users doc on save', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({}),
    });
    const onSaved = vi.fn();
    render(
      <ShippingAddressStep
        stepStatus={LOBBY_STEP_STATUS.ACTIVE}
        headingId="lobby-step-heading-address"
        savedAddress={null}
        isEditing={false}
        onSaved={onSaved}
      />,
    );
    await waitFor(() => screen.getByTestId('lobby-address-save'));
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Austin' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Pat' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: '1 Main' } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/ZIP/i), { target: { value: '78701' } });
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: 'US' } });
    fireEvent.click(screen.getByTestId('lobby-address-save'));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const payload = updateDoc.mock.calls[0][1];
    expect(payload.shippingAddress.city).toBe('Austin');
    expect(onSaved).toHaveBeenCalled();
  });
});