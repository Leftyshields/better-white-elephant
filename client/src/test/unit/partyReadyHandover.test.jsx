/**
 * PR 135 v3 UX items 2 and 3 with the real Party page around the real invite landing and card.
 * - Item 2 (UX probe 1): the seat shows up locally about 1ms after it is sent. Party must not
 *   swap the landing for the lobby while the card's seat retry and ready save are in flight,
 *   or the tap is lost. After the save, the lobby's card opens on "You're in!".
 * - Item 3: #t= is stripped only once the server has the seat (no pending local write),
 *   on the participants list and on the own-seat read (PR 137 path).
 * - PR 137 UX Low: own-seat read pending (checking), rejected (error), and ENDED.
 * The ready-handover and pending-strip tests fail on d3eacd3 + main baaf874.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Party } from '../../pages/Party.jsx';
import { GuestJoinCard, clearGuestJoinDrafts } from '../../components/GuestJoinCard.jsx';
import { readInviteTokenFromHash } from '../../utils/partyInvite.js';
import { GUEST_JOIN_COPY as COPY } from '../../utils/guestJoinCopy.js';
import { REQUEST_TIMEOUT_MS } from '../../utils/withTimeout.js';

const PARTY_ID = 'handover-party';
const TOKEN = 'feedfacefeedfacefeedfacefeedface';
const GUEST = { uid: 'anon-1', isAnonymous: true, displayName: null, email: null };

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const joinMock = vi.fn();
const getDocMock = vi.fn();
const updateDocMock = vi.fn();
const commitMock = vi.fn();
let batchOps = [];
const ensureGuestSession = vi.fn();
const authState = vi.hoisted(() => ({ currentUser: null }));

vi.mock('../../hooks/useAuth.js', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../hooks/useParty.js', () => ({ useParty: (...args) => usePartyMock(...args) }));
vi.mock('../../utils/analytics.js', () => ({ trackParticipantJoin: vi.fn(), trackError: vi.fn(), trackSubmitGift: vi.fn() }));
vi.mock('../../utils/api.js', () => ({ scrapeGiftUrl: vi.fn(), postPartyCode: vi.fn().mockResolvedValue({ ok: true, status: 200, body: { code: 'KX7P4MRB', token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }) }));
vi.mock('../../utils/firebase.js', () => ({ db: { name: 'test-db' }, auth: authState }));
vi.mock('firebase/firestore', () => ({
  // doc(collection) mints the new gift id 'gift-new'; doc(db, ...path) is a path ref.
  doc: vi.fn((_db, ...path) => (path.length ? { path: path.join('/') } : { path: 'gifts/gift-new', id: 'gift-new' })),
  collection: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDoc: (...args) => getDocMock(...args),
  writeBatch: () => ({
    set: (ref, data) => batchOps.push({ op: 'set', path: ref.path, data }),
    update: (ref, data) => batchOps.push({ op: 'update', path: ref.path, data }),
    commit: () => commitMock(),
  }),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: (...args) => updateDocMock(...args),
}));
vi.mock('../../utils/partyInvite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  joinPartyWithInviteToken: (...args) => joinMock(...args),
}));
vi.mock('../../components/SEO.jsx', () => ({ SEO: () => null }));
vi.mock('../../pages/GameRoom.jsx', () => ({ GameRoom: () => <div data-testid="game-room">Game</div> }));
// The lobby's own join card (PartyLobby renders it for a seated guest with the live seat).
vi.mock('../../components/PartyLobby.jsx', () => ({
  PartyLobby: ({ partyId }) => {
    const { participants } = usePartyMock(partyId);
    const seat = participants.find((p) => p.id === 'anon-1') || null;
    return (
      <div data-testid="party-lobby">
        <GuestJoinCard
          partyId={partyId}
          partyTitle="Swap"
          hostFirstName="Dana"
          user={{ uid: 'anon-1', isAnonymous: true }}
          participant={seat}
          gift={null}
          seated
          terminalMessage={null}
        />
      </div>
    );
  },
}));

const missing = { exists: () => false, data: () => undefined };
const lobbyParty = { id: PARTY_ID, title: 'Swap', status: 'LOBBY', adminId: 'h' };

function partyState(party, participants) {
  usePartyMock.mockReturnValue({ party, participants, loading: false, error: null });
}

function tree() {
  return (
    <MemoryRouter initialEntries={[`/party/${PARTY_ID}`]}>
      <Routes>
        <Route path="/party/:partyId" element={<Party />} />
      </Routes>
    </MemoryRouter>
  );
}

const flush = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};

beforeEach(() => {
  [useAuthMock, usePartyMock, joinMock, getDocMock, updateDocMock, commitMock, ensureGuestSession].forEach((m) => m.mockReset());
  batchOps = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  authState.currentUser = null;
});

afterEach(() => {
  clearGuestJoinDrafts();
  window.history.replaceState(null, '', '/');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('UX v3 probe 1: one tap survives the landing-to-lobby swap', () => {
  it('keeps the landing card until the retried seat and ready save settle, then the lobby opens on "You\'re in!"', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    useAuthMock.mockReturnValue({ user: null, loading: false, ensureGuestSession });
    ensureGuestSession.mockResolvedValue(GUEST);
    getDocMock.mockImplementation(async (ref) => (ref.path === `parties/${PARTY_ID}`
      ? { exists: () => true, data: () => ({ title: 'Swap', adminId: 'h', hostDisplayName: 'Dana Host', status: 'LOBBY', participantCount: 1 }) }
      : missing));
    let finishJoin;
    joinMock.mockReturnValue(new Promise((r) => { finishJoin = r; }));
    // The ready save (gift + seat in one batch, G26) hangs until finishReady.
    let finishReady;
    commitMock.mockReturnValue(new Promise((r) => { finishReady = r; }));
    partyState(lobbyParty, []);

    const view = render(tree());
    await act(async () => { await flush(20); });
    expect(joinMock).toHaveBeenCalledTimes(1);
    // The background seat write hangs past the deadline, so the card offers the retry.
    await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
    // Signed in now (the silent guest session).
    authState.currentUser = GUEST;
    useAuthMock.mockReturnValue({ user: GUEST, loading: false, ensureGuestSession });
    view.rerender(tree());

    fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/s' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));

    // Firestore applies the seat locally at once, before the server confirms it.
    partyState(lobbyParty, [{ id: 'anon-1', status: 'GOING', ready: false, hasPendingWrites: true }]);
    view.rerender(tree());
    expect(screen.queryByTestId('party-lobby')).toBeNull();
    expect(screen.getByTestId('guest-join-card')).toBeTruthy();
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);

    // Seat confirmed: the card goes on to save the gift and ready, still on the landing.
    partyState(lobbyParty, [{ id: 'anon-1', status: 'GOING', ready: false, hasPendingWrites: false }]);
    await act(async () => { finishJoin(); await flush(20); });
    view.rerender(tree());
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(batchOps.filter((o) => o.op === 'set' && o.path.startsWith('gifts/'))).toHaveLength(1);
    expect(batchOps).toContainEqual({
      op: 'update',
      path: `parties/${PARTY_ID}/participants/anon-1`,
      data: expect.objectContaining({ ready: true, hasGift: true, giftId: 'gift-new' }),
    });
    expect(screen.queryByTestId('party-lobby')).toBeNull();

    // Ready save acked; the confirmed snapshot has not arrived yet.
    partyState(lobbyParty, [{ id: 'anon-1', status: 'GOING', ready: true, hasPendingWrites: true }]);
    await act(async () => { finishReady(); await flush(20); });
    view.rerender(tree());

    expect(screen.getByTestId('party-lobby')).toBeTruthy();
    expect(screen.getByText(COPY.readyDone)).toBeTruthy();
    expect(screen.queryByRole('button', { name: COPY.readyCta })).toBeNull();
    // Exactly one ready save: one batch, no separate seat write.
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(batchOps.filter((o) => o.op === 'set' && o.path.startsWith('gifts/'))).toHaveLength(1);
  });
});

describe('Party strips #t= only after the server confirms the seat (UX v3 item 3)', () => {
  const user = { uid: 'guest-1', isAnonymous: true };

  beforeEach(() => {
    authState.currentUser = user;
    useAuthMock.mockReturnValue({ user, loading: false, ensureGuestSession });
  });

  it('keeps #t= while the own seat on the list is a pending local write, strips once it is confirmed', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    getDocMock.mockResolvedValue(missing);
    partyState(lobbyParty, [{ id: 'guest-1', displayName: 'Alex', hasPendingWrites: true }]);

    const view = render(tree());
    await act(async () => { await flush(); });
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);

    partyState(lobbyParty, [{ id: 'guest-1', displayName: 'Alex', hasPendingWrites: false }]);
    view.rerender(tree());
    await waitFor(() => expect(readInviteTokenFromHash(window.location.hash)).toBeNull());
    expect(window.location.pathname).toBe(`/party/${PARTY_ID}`);
  });

  function activeWithLaggingList(status, seatRead) {
    partyState({ id: PARTY_ID, title: 'Swap', status, adminId: 'h' }, []);
    getDocMock.mockImplementation((ref) => (ref.path === `parties/${PARTY_ID}/participants/guest-1` ? seatRead() : Promise.resolve(missing)));
  }

  it('own-seat read still pending (checking): spinner, #t= kept, no late card', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    activeWithLaggingList('ACTIVE', () => new Promise(() => {}));

    render(tree());
    await act(async () => { await flush(); });

    expect(screen.getByText('Loading party...')).toBeTruthy();
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(screen.queryByTestId('game-room')).toBeNull();
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
  });

  it('own-seat read rejected (error): #t= kept, no late card', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    activeWithLaggingList('ACTIVE', () => Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' })));

    render(tree());
    await act(async () => { await flush(); });

    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
  });

  it('ENDED game, own-seat read finds the seat on the server: strips #t= and shows the game', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    activeWithLaggingList('ENDED', async () => ({ exists: () => true, data: () => ({}), metadata: { hasPendingWrites: false } }));

    render(tree());

    expect(await screen.findByTestId('game-room')).toBeTruthy();
    await waitFor(() => expect(readInviteTokenFromHash(window.location.hash)).toBeNull());
  });

  it('own-seat read finds the seat only with a pending local write: shows the game, keeps #t=', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    activeWithLaggingList('ACTIVE', async () => ({ exists: () => true, data: () => ({}), metadata: { hasPendingWrites: true } }));

    render(tree());

    expect(await screen.findByTestId('game-room')).toBeTruthy();
    await act(async () => { await flush(); });
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
  });
});
