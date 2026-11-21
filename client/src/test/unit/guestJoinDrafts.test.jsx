/**
 * G18 + G24: the guest's name saves to their own seat on blur (debounced, sanitized, only when
 * valid and changed), and the gift draft survives F5 in sessionStorage (this tab only, never on
 * the seat) until a successful Ready clears it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuestJoinCard, NAME_SAVE_DEBOUNCE_MS } from '../../components/GuestJoinCard.jsx';
import { GUEST_JOIN_COPY as COPY } from '../../utils/guestJoinCopy.js';
import { readGuestGiftDraft, writeGuestGiftDraft } from '../../utils/guestGiftDraft.js';

const updateDocMock = vi.fn();
const addDocMock = vi.fn();
const setDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('../../utils/analytics.js', () => ({ trackSubmitGift: vi.fn() }));
vi.mock('../../utils/api.js', () => ({ scrapeGiftUrl: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  collection: vi.fn((_db, name) => ({ path: name })),
  addDoc: (...args) => addDocMock(...args),
  setDoc: (...args) => setDocMock(...args),
  updateDoc: (...args) => updateDocMock(...args),
  getDocs: (...args) => getDocsMock(...args),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn((...args) => args),
  limit: vi.fn((n) => n),
}));

const KEY = (partyId) => `sor.guestGiftDraft.${partyId}`;
let seq = 0;
const nextParty = () => `drafts-party-${(seq += 1)}`;

function card(partyId, props = {}) {
  return (
    <GuestJoinCard
      partyId={partyId}
      partyTitle="Winter Swap"
      hostFirstName="Dana"
      user={{ uid: 'anon-1', isAnonymous: true, displayName: null }}
      participant={{ id: 'anon-1', status: 'GOING', ready: false }}
      gift={null}
      seated
      terminalMessage={null}
      {...props}
    />
  );
}

const nameField = () => screen.getByLabelText(COPY.nameLabel);
const seatNameWrites = () =>
  updateDocMock.mock.calls.filter(([ref, data]) => /participants\/anon-1$/.test(ref.path) && !('ready' in data));

beforeEach(() => {
  updateDocMock.mockReset().mockResolvedValue(undefined);
  addDocMock.mockReset().mockResolvedValue({ id: 'g1' });
  setDocMock.mockReset().mockResolvedValue(undefined);
  getDocsMock.mockReset().mockResolvedValue({ empty: true, docs: [] });
  window.sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('G18: name saves to the seat on blur', () => {
  it('writes the sanitized seat name once after the debounce, without ready', () => {
    vi.useFakeTimers();
    render(card(nextParty()));
    fireEvent.change(nameField(), { target: { value: '  Alex   Kim ' } });
    fireEvent.blur(nameField());
    fireEvent.focus(nameField());
    fireEvent.blur(nameField());
    expect(seatNameWrites()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(NAME_SAVE_DEBOUNCE_MS));
    expect(seatNameWrites()).toHaveLength(1);
    const [ref, data] = seatNameWrites()[0];
    expect(ref.path).toMatch(/^parties\/drafts-party-\d+\/participants\/anon-1$/);
    expect(data).toMatchObject({ displayName: 'Alex', lastInitial: 'K' });
    expect(data).not.toHaveProperty('ready');
    expect(Object.keys(data).sort()).toEqual(['displayName', 'lastInitial', 'updatedAt']);
  });

  it('a quick retype restarts the wait and only the last name is written', () => {
    vi.useFakeTimers();
    render(card(nextParty()));
    fireEvent.change(nameField(), { target: { value: 'Al' } });
    fireEvent.blur(nameField());
    act(() => vi.advanceTimersByTime(NAME_SAVE_DEBOUNCE_MS - 50));
    fireEvent.change(nameField(), { target: { value: 'Alex' } });
    fireEvent.blur(nameField());
    act(() => vi.advanceTimersByTime(NAME_SAVE_DEBOUNCE_MS));
    expect(seatNameWrites()).toHaveLength(1);
    expect(seatNameWrites()[0][1]).toMatchObject({ displayName: 'Alex' });
  });

  it.each([
    ['an email', 'sam@example.com'],
    ['blank', '   '],
  ])('does not write %s', (_label, value) => {
    vi.useFakeTimers();
    render(card(nextParty()));
    fireEvent.change(nameField(), { target: { value } });
    fireEvent.blur(nameField());
    act(() => vi.advanceTimersByTime(NAME_SAVE_DEBOUNCE_MS * 3));
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('does not write a name that already matches the seat', () => {
    vi.useFakeTimers();
    render(card(nextParty(), { participant: { id: 'anon-1', status: 'GOING', ready: false, displayName: 'Alex' } }));
    fireEvent.blur(nameField());
    act(() => vi.advanceTimersByTime(NAME_SAVE_DEBOUNCE_MS * 3));
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('waits for the seat: no write before seated, one write once the seat lands', () => {
    vi.useFakeTimers();
    const partyId = nextParty();
    const { rerender } = render(card(partyId, { seated: false, participant: null }));
    fireEvent.change(nameField(), { target: { value: 'Alex' } });
    fireEvent.blur(nameField());
    act(() => vi.advanceTimersByTime(NAME_SAVE_DEBOUNCE_MS * 3));
    expect(updateDocMock).not.toHaveBeenCalled();
    rerender(card(partyId));
    act(() => vi.advanceTimersByTime(NAME_SAVE_DEBOUNCE_MS));
    expect(seatNameWrites()).toHaveLength(1);
  });

  it('after F5 the name comes back from the seat', () => {
    render(card(nextParty(), { participant: { id: 'anon-1', status: 'GOING', ready: false, displayName: 'Alex' } }));
    expect(nameField()).toHaveValue('Alex');
  });

  it('a failed name save logs only the error code, never the name', async () => {
    updateDocMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    render(card(nextParty()));
    fireEvent.change(nameField(), { target: { value: 'Alex' } });
    fireEvent.blur(nameField());
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(JSON.stringify(console.error.mock.calls)).not.toMatch(/Alex/);
  });
});

describe('G24: gift draft survives F5 in sessionStorage', () => {
  it('restores the link, manual title and price after F5 and never puts them on the seat', () => {
    const partyId = nextParty();
    const first = render(card(partyId));
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    fireEvent.change(screen.getByLabelText(COPY.giftPriceLabel), { target: { value: '25' } });
    const stored = JSON.parse(window.sessionStorage.getItem(KEY(partyId)));
    expect(stored).toMatchObject({ giftUrl: 'https://example.com/socks', manual: true, manualTitle: 'Wool socks', manualPrice: '25' });
    expect(stored).not.toHaveProperty('name');
    first.unmount();

    // F5: a fresh page has no in-memory draft, only this tab's sessionStorage. Copy the stored
    // draft to a party this test file has never rendered, so only sessionStorage can fill it.
    const reloaded = nextParty();
    window.sessionStorage.setItem(KEY(reloaded), JSON.stringify(stored));
    render(card(reloaded));
    expect(screen.getByLabelText(COPY.giftUrlLabel)).toHaveValue('https://example.com/socks');
    expect(screen.getByLabelText(COPY.giftTitleLabel)).toHaveValue('Wool socks');
    expect(screen.getByLabelText(COPY.giftPriceLabel)).toHaveValue('25');
    expect(screen.getAllByText('1 step left').length).toBeGreaterThan(0);
    for (const [, data] of updateDocMock.mock.calls) {
      expect(JSON.stringify(data)).not.toMatch(/socks/);
    }
  });

  it('a successful Ready clears the draft', async () => {
    const partyId = nextParty();
    render(card(partyId));
    fireEvent.change(nameField(), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    expect(window.sessionStorage.getItem(KEY(partyId))).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.sessionStorage.getItem(KEY(partyId))).toBeNull());
  });

  it('after F5 mid-save, Ready reuses the gift already written instead of adding a second one', async () => {
    // The first Ready wrote the gift, then the page reloaded before the lobby saw it: the draft is
    // back from sessionStorage and the card has no gift prop yet.
    const partyId = nextParty();
    window.sessionStorage.setItem(
      KEY(partyId),
      JSON.stringify({ giftUrl: 'https://example.com/socks', preview: null, manual: true, manualTitle: 'Wool socks', manualPrice: '25' }),
    );
    getDocsMock.mockResolvedValue({ empty: false, docs: [{ id: 'gift-already-saved' }] });
    render(card(partyId, { participant: { id: 'anon-1', status: 'GOING', ready: false, displayName: 'Sam' } }));
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { path: 'gifts/gift-already-saved' },
        expect.objectContaining({ title: 'Wool socks', url: 'https://example.com/socks' }),
      ),
    );
    expect(addDocMock).not.toHaveBeenCalled();
    // The lookup is scoped to this guest in this party.
    const { where } = await import('firebase/firestore');
    expect(where).toHaveBeenCalledWith('partyId', '==', partyId);
    expect(where).toHaveBeenCalledWith('submitterId', '==', 'anon-1');
  });

  it('with no earlier gift, Ready adds exactly one', async () => {
    const partyId = nextParty();
    window.sessionStorage.setItem(
      KEY(partyId),
      JSON.stringify({ giftUrl: 'https://example.com/socks', preview: null, manual: true, manualTitle: 'Wool socks', manualPrice: '' }),
    );
    render(card(partyId, { participant: { id: 'anon-1', status: 'GOING', ready: false, displayName: 'Sam' } }));
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
  });

  it('if the gift lookup fails, nothing is added and the typed gift stays', async () => {
    getDocsMock.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }));
    const partyId = nextParty();
    window.sessionStorage.setItem(
      KEY(partyId),
      JSON.stringify({ giftUrl: 'https://example.com/socks', preview: null, manual: true, manualTitle: 'Wool socks', manualPrice: '' }),
    );
    render(card(partyId, { participant: { id: 'anon-1', status: 'GOING', ready: false, displayName: 'Sam' } }));
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
    await waitFor(() => expect(screen.getByText(COPY.joinFailedToast)).toBeInTheDocument());
    expect(addDocMock).not.toHaveBeenCalled();
    expect(readGuestGiftDraft(partyId).manualTitle).toBe('Wool socks');
  });

  it('a failed Ready keeps the draft', async () => {
    updateDocMock.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }));
    const partyId = nextParty();
    render(card(partyId));
    fireEvent.change(nameField(), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
    await waitFor(() => expect(screen.getByText(COPY.joinFailedToast)).toBeInTheDocument());
    expect(readGuestGiftDraft(partyId)).toMatchObject({ giftUrl: 'https://example.com/socks', manualTitle: 'Wool socks' });
  });

  it('drafts are per party', () => {
    writeGuestGiftDraft('party-a', { giftUrl: 'https://a.example/x', preview: null, manual: true, manualTitle: 'A', manualPrice: '' });
    expect(readGuestGiftDraft('party-b')).toEqual({});
    expect(readGuestGiftDraft('party-a').manualTitle).toBe('A');
  });

  it('ignores a tampered or malformed draft', () => {
    window.sessionStorage.setItem(KEY('bad'), '{not json');
    expect(readGuestGiftDraft('bad')).toEqual({});
    window.sessionStorage.setItem(
      KEY('evil'),
      JSON.stringify({ giftUrl: 42, manual: 'yes', preview: { url: 'javascript:alert(1)', title: 'x', image: 'javascript:1' } }),
    );
    expect(readGuestGiftDraft('evil')).toEqual({ giftUrl: '', preview: null, manual: false, manualTitle: '', manualPrice: '' });
    window.sessionStorage.setItem(
      KEY('img'),
      JSON.stringify({ preview: { url: 'https://a.example/x', title: 'Mug', image: 'javascript:1', price: '$5' } }),
    );
    expect(readGuestGiftDraft('img').preview).toEqual({ url: 'https://a.example/x', title: 'Mug', image: null, price: '$5' });
  });

  it('keeps working when sessionStorage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    render(card(nextParty()));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/x' } });
    expect(screen.getByLabelText(COPY.giftUrlLabel)).toHaveValue('https://example.com/x');
    spy.mockRestore();
  });
});
