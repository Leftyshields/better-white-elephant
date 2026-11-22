/**
 * A0 per-game shipping address form: real api.js against a stubbed fetch.
 * Heading + fields + Save, no checkbox or notice line; saved view with Edit; clear = one confirm then delete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../utils/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
}));

import { ShippingAddressSection } from '../../components/ShippingAddressSection.jsx';
import {
  SHIPPING_ADDRESS_DELETE_CONFIRM,
  SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION,
  SHIPPING_ADDRESS_DELETE_SUCCESS,
  SHIPPING_ADDRESS_FORM_COPY as COPY,
} from '../../utils/shippingAddressCopy.js';

// Made-up test address, never real data.
const ADDRESS = { name: 'Test Winner', street: '1 Example St', city: 'Testville', state: 'CA', zip: '00000', country: 'US' };
const EMPTY = { name: '', street: '', city: '', state: '', zip: '', country: '' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fill = (address) => {
  for (const [key, value] of Object.entries(address)) {
    fireEvent.change(screen.getByLabelText(COPY.fields[key].label), { target: { value } });
  }
};
const saveButton = () => screen.getByRole('button', { name: COPY.save });
const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);

describe('ShippingAddressSection (A0)', () => {
  it('empty: visible heading, six fields, Save disabled; no checkbox and no notice line', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: null }));
    render(<ShippingAddressSection partyId="party-1" />);
    expect(screen.getByRole('heading', { name: 'Shipping address' })).toBeTruthy();
    await screen.findByLabelText(COPY.fields.name.label);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/party-shipping\/party-1$/);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/sees your address|I agree|check the box/i)).toBeNull();
    expect(saveButton().disabled).toBe(true);
  });

  it('typing: Save stays disabled until all six are filled, then saves via POST and shows the saved view', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: null }));
    render(<ShippingAddressSection partyId="party-1" />);
    await screen.findByLabelText(COPY.fields.name.label);
    fill({ ...EMPTY, name: ADDRESS.name, street: ADDRESS.street });
    expect(saveButton().disabled).toBe(true);
    fill(ADDRESS);
    expect(saveButton().disabled).toBe(false);

    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: ADDRESS }));
    fireEvent.click(saveButton());
    await screen.findByRole('button', { name: COPY.editAria });
    const [url, init] = fetchMock.mock.calls.at(-1);
    expect(url).toMatch(/\/api\/party-shipping\/party-1$/);
    expect(init.method).toBe('POST');
    expect(lastBody()).toEqual({ address: ADDRESS });
    expect(screen.getByText(ADDRESS.street)).toBeTruthy();
    expect(screen.queryByLabelText(COPY.fields.name.label)).toBeNull();
  });

  it('saved on load: shows the address and Edit (labelled), Edit reopens the filled form, Cancel returns', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: ADDRESS }));
    render(<ShippingAddressSection partyId="party-1" />);
    const edit = await screen.findByRole('button', { name: COPY.editAria });
    expect(edit.textContent).toBe(COPY.edit);
    fireEvent.click(edit);
    expect(screen.getByLabelText(COPY.fields.city.label).value).toBe(ADDRESS.city);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: COPY.editAria })).toBeTruthy();
  });

  it('clear all + Save asks once, then deletes (all six empty) and says so', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: ADDRESS }));
    render(<ShippingAddressSection partyId="party-1" />);
    fireEvent.click(await screen.findByRole('button', { name: COPY.editAria }));
    fill(EMPTY);
    fireEvent.click(saveButton());
    expect(screen.getByText(SHIPPING_ADDRESS_DELETE_CONFIRM)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: null }));
    fireEvent.click(screen.getByRole('button', { name: SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION }));
    await screen.findByText(SHIPPING_ADDRESS_DELETE_SUCCESS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastBody()).toEqual({ address: EMPTY });
    expect(screen.getByRole('status').textContent).toBe(SHIPPING_ADDRESS_DELETE_SUCCESS);
  });

  it('clear with nothing saved does not enable Save (no delete call)', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: null }));
    render(<ShippingAddressSection partyId="party-1" />);
    await screen.findByLabelText(COPY.fields.name.label);
    expect(saveButton().disabled).toBe(true);
    fireEvent.submit(saveButton().closest('form'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('save 503: real saveFailed error, typed values kept, never the saved view; Try again saves', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: null }));
    render(<ShippingAddressSection partyId="party-1" />);
    await screen.findByLabelText(COPY.fields.name.label);
    expect(screen.queryByRole('alert')).toBeNull();
    fill(ADDRESS);
    fetchMock.mockResolvedValueOnce(json(503, { error: 'Try again later' }));
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe(COPY.saveFailed);
    for (const [key, value] of Object.entries(ADDRESS)) {
      expect(screen.getByLabelText(COPY.fields[key].label).value).toBe(value);
    }
    expect(screen.queryByRole('button', { name: COPY.editAria })).toBeNull();
    expect(screen.queryByText(SHIPPING_ADDRESS_DELETE_SUCCESS)).toBeNull();

    // Try again resubmits what is in the fields now (one edit after the failure).
    fireEvent.change(screen.getByLabelText(COPY.fields.zip.label), { target: { value: '11111' } });
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: { ...ADDRESS, zip: '11111' } }));
    fireEvent.click(screen.getByRole('button', { name: COPY.retry }));
    await screen.findByRole('button', { name: COPY.editAria });
    expect(lastBody()).toEqual({ address: { ...ADDRESS, zip: '11111' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('save network failure while editing a saved address keeps the edit and does not show the new address as saved', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: ADDRESS }));
    render(<ShippingAddressSection partyId="party-1" />);
    fireEvent.click(await screen.findByRole('button', { name: COPY.editAria }));
    fireEvent.change(screen.getByLabelText(COPY.fields.street.label), { target: { value: '2 New Rd' } });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe(COPY.saveFailed);
    expect(screen.getByLabelText(COPY.fields.street.label).value).toBe('2 New Rd');
    expect(screen.queryByRole('button', { name: COPY.editAria })).toBeNull();
    expect(screen.getByRole('button', { name: COPY.retry })).toBeTruthy();
  });

  it('delete 503: stays in the saved view with deleteFailed; Try again deletes without a second confirm', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: ADDRESS }));
    render(<ShippingAddressSection partyId="party-1" />);
    fireEvent.click(await screen.findByRole('button', { name: COPY.editAria }));
    fill(EMPTY);
    fireEvent.click(saveButton());
    fetchMock.mockResolvedValueOnce(json(503, { error: 'Try again later' }));
    fireEvent.click(screen.getByRole('button', { name: SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION }));
    expect((await screen.findByRole('alert')).textContent).toBe(COPY.deleteFailed);
    expect(screen.getByText(ADDRESS.street)).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.editAria })).toBeTruthy();
    expect(screen.queryByText(SHIPPING_ADDRESS_DELETE_SUCCESS)).toBeNull();

    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: null }));
    fireEvent.click(screen.getByRole('button', { name: COPY.retry }));
    await screen.findByText(SHIPPING_ADDRESS_DELETE_SUCCESS);
    expect(lastBody()).toEqual({ address: EMPTY });
    expect(screen.queryByText(SHIPPING_ADDRESS_DELETE_CONFIRM)).toBeNull();
    expect(screen.queryByText(ADDRESS.street)).toBeNull();
  });

  it('failed load shows the error and Try again reloads', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));
    render(<ShippingAddressSection partyId="party-1" />);
    expect((await screen.findByRole('alert')).textContent).toBe(COPY.loadFailed);
    fetchMock.mockResolvedValueOnce(json(200, { shippingAddress: ADDRESS }));
    fireEvent.click(screen.getByRole('button', { name: COPY.retry }));
    await waitFor(() => expect(screen.getByText(ADDRESS.street)).toBeTruthy());
  });
});
