import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { Home } from '../../pages/Home.jsx';
import { Rules } from '../../pages/Rules.jsx';
import { HowToPlay } from '../../pages/HowToPlay.jsx';
import { LANDING_COPY } from '../../utils/landingMarketingCopy.js';
import { PENDING_HOST_CTA_KEY } from '../../hooks/useHostFreeGame.js';

const signInWithGoogle = vi.fn();
let authLoading = false;

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: null,
    loading: authLoading,
    signInWithGoogle,
    signInWithEmailAndPassword: vi.fn(),
    signUpWithEmailAndPassword: vi.fn(),
  }),
}));

vi.mock('../../utils/analytics.js', () => ({
  trackButtonClick: vi.fn(),
  trackCreateParty: vi.fn(),
  trackSignUp: vi.fn(),
  trackLogin: vi.fn(),
  trackGameAbandoned: vi.fn(),
  trackError: vi.fn(),
}));

function renderRulesHostFlow(initialPath) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <PartyModalProvider>
          <Routes>
            <Route path="/rules" element={<Rules />} />
            <Route path="/how-to-play" element={<HowToPlay />} />
            <Route path="/" element={<Home />} />
          </Routes>
        </PartyModalProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

async function clickRulesHostCta() {
  const cta = screen.getByRole('link', { name: LANDING_COPY.primaryCta });
  fireEvent.click(cta);
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe('Rules / How to Play host CTA navigation (H7)', () => {
  beforeEach(() => {
    authLoading = false;
    signInWithGoogle.mockReset();
    signInWithGoogle.mockResolvedValue({
      success: false,
      error: 'Firebase: Error (auth/popup-blocked).',
    });
    window.sessionStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('Rules Host click scrolls home, focuses hero CTA, and shows popup-blocked notice', async () => {
    renderRulesHostFlow('/rules');
    await clickRulesHostCta();

    const hostButton = await screen.findByRole('button', { name: /host a free game/i });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(hostButton).toHaveAttribute('id', 'host-free-game-cta');
    await waitFor(() => {
      expect(document.activeElement).toBe(hostButton);
    });
    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(/could not open the Google sign-in window/i);
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(PENDING_HOST_CTA_KEY)).toBeNull();
  });

  it('How to Play Host click scrolls home, focuses hero CTA, and shows popup-blocked notice', async () => {
    renderRulesHostFlow('/how-to-play');
    await clickRulesHostCta();

    const hostButton = await screen.findByRole('button', { name: /host a free game/i });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    await waitFor(() => {
      expect(document.activeElement).toBe(hostButton);
    });
    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(/could not open the Google sign-in window/i);
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('does not queue navigation while auth is still loading', async () => {
    authLoading = true;
    renderRulesHostFlow('/rules');
    await clickRulesHostCta();
    expect(window.sessionStorage.getItem(PENDING_HOST_CTA_KEY)).toBeNull();
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });
});
