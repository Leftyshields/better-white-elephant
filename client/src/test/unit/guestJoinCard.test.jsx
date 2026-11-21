/**
 * Guest one-screen card (batch 2 item 4): honest progress, one ready control, busy label,
 * error toast that keeps typed values, no address step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GuestJoinCard } from '../../components/GuestJoinCard.jsx';
import { GUEST_JOIN_COPY as COPY, guestStepsHeader } from '../../utils/guestJoinCopy.js';
import { scrapeGiftUrl } from '../../utils/api.js';
import { REQUEST_TIMEOUT_MS } from '../../utils/withTimeout.js';

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
    expect(COPY.giftChecking).toBe('Checking your gift link...');
    expect(COPY.giftLookupSlow).toBe('That link is taking too long. Add the details below, or try it again.');
    expect(COPY.giftTryUrl).toBe('Try the link again');
    expect(COPY.readyLockedSeat).toBe('Saving your spot...');
    expect(COPY.readySaveSlow).toBe("That's taking too long. Your name and gift are still here. Tap I'm ready to try again.");
    expect(COPY.giftPending).toBe('Processing...');
  });
});


function fillNameAndManualGift({
  name = 'Sam Lee',
  url = 'https://example.com/socks',
  title = 'Wool socks',
  price = '25',
} = {}) {
  fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
  fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: url } });
  fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: title } });
  fireEvent.change(screen.getByLabelText(COPY.giftPriceLabel), { target: { value: price } });
}

describe('GuestJoinCard', () => {
  beforeEach(() => {
    updateDocMock.mockReset().mockResolvedValue(undefined);
    addDocMock.mockReset().mockResolvedValue({ id: 'g1' });
    setDocMock.mockReset().mockResolvedValue(undefined);
    scrapeGiftUrl.mockReset();
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

  it('ready state swaps the welcome body for guest.welcome.done (host name) and keeps the title', () => {
    renderCard({ participant: { id: 'anon-1', ready: true, displayName: 'Sam' }, gift: { id: 'g1', title: 'Socks' } });
    expect(screen.getByText(COPY.welcomeTitle('Winter Swap'))).toBeInTheDocument();
    expect(screen.getByText('Dana here. Thanks for the gift. See you at the game.')).toBeInTheDocument();
    expect(screen.queryByText(COPY.welcomeBody('Dana'))).toBeNull();
  });

  it('ready state uses the no-name guest.welcome.done when the host name is not shared', () => {
    renderCard({ hostFirstName: null, participant: { id: 'anon-1', ready: true, displayName: 'Sam' }, gift: { id: 'g1', title: 'Socks' } });
    expect(screen.getByText('Thanks for the gift. Your host will see you at the game.')).toBeInTheDocument();
    expect(screen.queryByText(COPY.welcomeBody(null))).toBeNull();
  });

  it('before ready, the welcome body is unchanged', () => {
    renderCard();
    expect(screen.getByText(COPY.welcomeBody('Dana'))).toBeInTheDocument();
    expect(screen.queryByText(/Thanks for the gift/)).toBeNull();
  });

  it('manual gift entry shows the signed helper', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    expect(screen.getByText("This store won't share its gift details with us. Add them below.")).toBeInTheDocument();
  });

  it('shows the ready state with one way back', () => {
    renderCard({ participant: { id: 'anon-1', ready: true, displayName: 'Sam' }, gift: { id: 'g1', title: 'Socks' } });
    expect(screen.getByText(COPY.readyDone)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.readyUndo })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.readyCta })).toBeNull();
  });


  it('shows Saving your spot when name and gift are in but the seat is still pending', () => {
    renderCard({ seated: false, participant: null });
    fillNameAndManualGift();
    expect(readyButton()).toBeDisabled();
    expect(screen.getByText(COPY.readyLockedSeat)).toBeInTheDocument();
    expect(screen.getByText(COPY.readyLockedSeat)).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(/\bseat\b/i)).toBeNull();
  });
});

describe('GuestJoinCard timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateDocMock.mockReset().mockResolvedValue(undefined);
    addDocMock.mockReset();
    setDocMock.mockReset().mockResolvedValue(undefined);
    scrapeGiftUrl.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('unlocks a hung gift lookup at 10s, opens manual entry, keeps the URL, and shows the slow line', async () => {
    scrapeGiftUrl.mockReturnValue(new Promise(() => {}));
    renderCard();
    const urlField = screen.getByLabelText(COPY.giftUrlLabel);
    fireEvent.change(urlField, { target: { value: 'https://example.com/socks' } });
    fireEvent.blur(urlField);
    expect(screen.getByText(COPY.giftChecking)).toBeInTheDocument();
    expect(screen.getByText(COPY.giftChecking)).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(COPY.giftPending)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByText(COPY.giftLookupSlow)).toBeInTheDocument();
    expect(screen.getByText(COPY.giftLookupSlow)).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText(COPY.giftUrlLabel)).toHaveValue('https://example.com/socks');
    expect(screen.getByLabelText(COPY.giftTitleLabel)).toBeInTheDocument();
    expect(screen.queryByText(COPY.giftChecking)).toBeNull();
  });

  it('retries a slow lookup and keeps typed values', async () => {
    scrapeGiftUrl.mockReturnValueOnce(new Promise(() => {}));
    scrapeGiftUrl.mockResolvedValueOnce({ title: 'Wool socks', image: null, price: '$25', error: null });
    renderCard();
    const urlField = screen.getByLabelText(COPY.giftUrlLabel);
    fireEvent.change(urlField, { target: { value: 'https://example.com/socks' } });
    fireEvent.blur(urlField);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Kept title' } });
    fireEvent.change(screen.getByLabelText(COPY.giftPriceLabel), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.giftTryUrl }));
    expect(screen.getByText(COPY.giftChecking)).toBeInTheDocument();
    expect(screen.getByLabelText(COPY.giftUrlLabel)).toHaveValue('https://example.com/socks');
    expect(screen.getByLabelText(COPY.giftTitleLabel)).toHaveValue('Kept title');
    expect(screen.getByLabelText(COPY.giftPriceLabel)).toHaveValue('12');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('gift-preview')).toHaveTextContent('Wool socks');
    expect(scrapeGiftUrl).toHaveBeenCalledTimes(2);
  });

  it('ignores a late lookup result after the timeout', async () => {
    let finish;
    scrapeGiftUrl.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderCard();
    const urlField = screen.getByLabelText(COPY.giftUrlLabel);
    fireEvent.change(urlField, { target: { value: 'https://example.com/socks' } });
    fireEvent.blur(urlField);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByText(COPY.giftLookupSlow)).toBeInTheDocument();
    await act(async () => {
      finish({ title: 'Late Gift', image: null, price: null, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('Late Gift')).toBeNull();
    expect(screen.queryByTestId('gift-preview')).toBeNull();
    expect(screen.getByText(COPY.giftLookupSlow)).toBeInTheDocument();
    expect(screen.getByLabelText(COPY.giftUrlLabel)).toHaveValue('https://example.com/socks');
  });

  it('unlocks a hung ready save at 10s, shows the slow line, and keeps typed values', async () => {
    addDocMock.mockReturnValue(new Promise(() => {}));
    renderCard();
    fillNameAndManualGift();
    fireEvent.click(readyButton());
    expect(readyButton()).toHaveTextContent(COPY.readySaving);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByText(COPY.readySaveSlow)).toBeInTheDocument();
    expect(screen.getByText(COPY.readySaveSlow)).toHaveAttribute('aria-live', 'polite');
    expect(readyButton()).toBeEnabled();
    expect(readyButton()).toHaveTextContent(COPY.readyCta);
    expect(screen.getByLabelText(COPY.nameLabel)).toHaveValue('Sam Lee');
    expect(screen.getByLabelText(COPY.giftUrlLabel)).toHaveValue('https://example.com/socks');
    expect(screen.getByLabelText(COPY.giftTitleLabel)).toHaveValue('Wool socks');
    expect(screen.getByLabelText(COPY.giftPriceLabel)).toHaveValue('25');
  });

  it('a late save plus a retry does not create a second gift doc', async () => {
    let finish;
    addDocMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    updateDocMock.mockResolvedValue(undefined);
    renderCard();
    fillNameAndManualGift();
    fireEvent.click(readyButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByText(COPY.readySaveSlow)).toBeInTheDocument();
    await act(async () => {
      finish({ id: 'g1' });
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(readyButton());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock).toHaveBeenCalledWith(
      { path: 'gifts/g1' },
      expect.objectContaining({ title: 'Wool socks', url: 'https://example.com/socks' }),
    );
  });

  it('a fast lookup and a fast save are unchanged', async () => {
    scrapeGiftUrl.mockResolvedValue({ title: 'Wool socks', image: null, price: null, error: null });
    addDocMock.mockResolvedValue({ id: 'g1' });
    updateDocMock.mockResolvedValue(undefined);
    renderCard();
    fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: 'Sam Lee' } });
    const urlField = screen.getByLabelText(COPY.giftUrlLabel);
    fireEvent.change(urlField, { target: { value: 'https://example.com/socks' } });
    fireEvent.blur(urlField);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('gift-preview')).toHaveTextContent('Wool socks');
    expect(screen.queryByText(COPY.giftLookupSlow)).toBeNull();
    fireEvent.click(readyButton());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COPY.readySaveSlow)).toBeNull();
  });
});
