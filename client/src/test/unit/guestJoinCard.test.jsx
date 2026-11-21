/**
 * Guest one-screen card (batch 2 item 4): honest progress, one ready control, busy label,
 * error toast that keeps typed values, no address step.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GuestJoinCard } from '../../components/GuestJoinCard.jsx';
import { GUEST_JOIN_COPY as COPY, guestStepsHeader } from '../../utils/guestJoinCopy.js';

const updateDocMock = vi.fn();
const addDocMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('../../utils/analytics.js', () => ({ trackSubmitGift: vi.fn() }));
vi.mock('../../utils/api.js', () => ({ scrapeGiftUrl: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  collection: vi.fn((_db, name) => ({ path: name })),
  addDoc: (...args) => addDocMock(...args),
  setDoc: (...args) => setDocMock(...args),
  updateDoc: (...args) => updateDocMock(...args),
}));

let seq = 0;
function renderCard(props = {}) {
  seq += 1;
  return render(
    <GuestJoinCard
      partyId={`party-${seq}`}
      partyTitle="Winter Swap"
      hostFirstName="Dana"
      user={{ uid: 'anon-1', isAnonymous: true, displayName: null }}
      participant={{ id: 'anon-1', status: 'GOING', ready: false }}
      gift={null}
      seated
      terminalMessage={null}
      {...props}
    />,
  );
}

const readyButton = () => screen.getByRole('button', { name: new RegExp(`^(${COPY.readyCta}|${COPY.readySaving})$`) });

describe('steps header copy', () => {
  it('says what is left, honestly, both ways', () => {
    expect(guestStepsHeader(2)).toBe('2 steps left');
    expect(guestStepsHeader(1)).toBe('1 step left');
    expect(guestStepsHeader(0)).toBe("Your name and gift are in. Tap I'm ready.");
    expect(COPY.stepArrived).toBe("You're here");
    expect(COPY.readySaving).toBe('Saving...');
    expect(COPY.joinFailedToast).toBe("We couldn't get you ready. Try again in a moment.");
  });
});

describe('GuestJoinCard', () => {
  beforeEach(() => {
    updateDocMock.mockReset().mockResolvedValue(undefined);
    addDocMock.mockReset().mockResolvedValue({ id: 'g1' });
    setDocMock.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it("credits You're here on arrival and counts down as name and gift land", () => {
    renderCard();
    const list = screen.getByRole('list');
    expect(within(list).getByText(COPY.stepArrived).closest('li')).toHaveAttribute('data-done', 'true');
    expect(screen.getAllByText('2 steps left').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: 'Sam' } });
    expect(screen.getAllByText('1 step left').length).toBeGreaterThan(0);
    expect(screen.queryByText(/%|complete/i)).toBeNull();
  });

  it('has exactly one ready control, locked with a reason until name and gift are in', () => {
    renderCard();
    expect(screen.getAllByRole('button', { name: COPY.readyCta })).toHaveLength(1);
    expect(readyButton()).toBeDisabled();
    expect(screen.getByText(COPY.readyLockedName)).toBeInTheDocument();
    expect(screen.queryByText(/shipping address/i)).toBeNull();
  });

  it('rejects an email as a name', () => {
    renderCard();
    const name = screen.getByLabelText(COPY.nameLabel);
    fireEvent.change(name, { target: { value: 'sam@example.com' } });
    fireEvent.blur(name);
    expect(screen.getByText(COPY.nameError)).toBeInTheDocument();
    expect(readyButton()).toBeDisabled();
  });

  it('saves gift, name and ready together, showing Saving... while busy', async () => {
    let finish;
    updateDocMock.mockReturnValue(new Promise((r) => { finish = r; }));
    renderCard();
    fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    expect(screen.getAllByText(COPY.allStepsDone).length).toBeGreaterThan(0);
    fireEvent.click(readyButton());
    await waitFor(() => expect(readyButton()).toHaveTextContent(COPY.readySaving));
    expect(readyButton()).toHaveAttribute('aria-busy', 'true');
    expect(readyButton()).toBeDisabled();
    finish();
    await waitFor(() => expect(readyButton()).toHaveTextContent(COPY.readyCta));
    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect(addDocMock.mock.calls[0][1]).toMatchObject({ submitterId: 'anon-1', title: 'Wool socks', url: 'https://example.com/socks' });
    expect(updateDocMock).toHaveBeenCalledWith(
      { path: expect.stringMatching(/participants\/anon-1$/) },
      expect.objectContaining({ ready: true, displayName: 'Sam', lastInitial: 'L' }),
    );
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('a failed save shows the toast and keeps every typed value', async () => {
    updateDocMock.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }));
    renderCard();
    fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    fireEvent.click(readyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.joinFailedToast);
    expect(screen.getByLabelText(COPY.nameLabel)).toHaveValue('Sam');
    expect(screen.getByLabelText(COPY.giftTitleLabel)).toHaveValue('Wool socks');
    expect(readyButton()).toBeEnabled();
  });

  it('refuses a store name as the gift title', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://www.amazon.com/dp/x' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Amazon' } });
    expect(screen.getByText(COPY.giftStoreName)).toBeInTheDocument();
  });

  it('cannot ready before the seat lands', () => {
    renderCard({ seated: false, participant: null });
    fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: 'Sam' } });
    expect(readyButton()).toBeDisabled();
  });

  it('shows the ready state with one way back', () => {
    renderCard({ participant: { id: 'anon-1', ready: true, displayName: 'Sam' }, gift: { id: 'g1', title: 'Socks' } });
    expect(screen.getByText(COPY.readyDone)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.readyUndo })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.readyCta })).toBeNull();
  });
});
