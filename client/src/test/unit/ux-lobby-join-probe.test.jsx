/**
 * UX HOLD repro: a guest who joins in LOBBY must not see the late card when
 * the host starts. Copied from UX's ux-lobby-join-probe.test.jsx.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

const renders = [];
const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const seatDb = { exists: false };
let resolvers = [];
vi.mock('../../hooks/useAuth.js', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../hooks/useParty.js', () => ({ useParty: (...a) => usePartyMock(...a) }));
vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: () => Promise.resolve({ exists: () => seatDb.exists }),
}));
vi.mock('../../pages/GameRoom.jsx', () => ({ GameRoom: () => { renders.push('game-room'); return null; } }));
vi.mock('../../components/PartyLobby.jsx', () => ({ PartyLobby: () => { renders.push('lobby'); return null; } }));
vi.mock('../../components/PartyInviteLanding.jsx', () => ({
  PartyInviteLanding: () => { renders.push('landing'); return null; },
  hostFirstNameFromParty: () => 'Dana',
}));
vi.mock('../../components/LateInviteCard.jsx', () => ({
  LateInviteCard: function LC({ state }) { React.useLayoutEffect(() => { renders.push('LATE-CARD-COMMITTED:' + state); }, []); return null; },
  LateInvitePage: ({ children }) => children,
  shouldShowLateSignIn: () => false,
}));
vi.mock('../../components/SEO.jsx', () => ({ SEO: () => null }));
import { Party } from '../../pages/Party.jsx';

const mk = (n) => (<MemoryRouter key="r" data-n={n} initialEntries={['/party/p1']}><Routes><Route path="/party/:partyId" element={<Party />} /></Routes></MemoryRouter>);

describe('UX probe: guest joins in LOBBY via landing, then host starts', () => {
  it('a player who joined in LOBBY never sees the late card when the game starts', async () => {
    const user = { uid: 'guest-1', isAnonymous: true, providerData: [] };
    useAuthMock.mockReturnValue({ user, loading: false });
    // 1. Session exists (guest just minted by landing), party LOBBY, seat not written yet.
    usePartyMock.mockReturnValue({ party: { id: 'p1', title: 'Office Swap', status: 'LOBBY' }, participants: [], loading: false, error: null });
    const r = render(mk(1));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // 2. Seat write lands.
    seatDb.exists = true;
    usePartyMock.mockReturnValue({ party: { id: 'p1', title: 'Office Swap', status: 'LOBBY' }, participants: [{ id: 'guest-1' }], loading: false, error: null });
    await act(async () => { r.rerender(mk(2)); });
    // 3. Host starts the game.
    usePartyMock.mockReturnValue({ party: { id: 'p1', title: 'Office Swap', status: 'ACTIVE' }, participants: [{ id: 'guest-1' }], loading: false, error: null });
    await act(async () => { r.rerender(mk(3)); await Promise.resolve(); });
    console.log('RENDER LOG', JSON.stringify(renders));
    expect(renders.some((x) => x.startsWith('LATE-CARD'))).toBe(false);
    expect(renders.at(-1)).toBe('game-room');
  });
});
