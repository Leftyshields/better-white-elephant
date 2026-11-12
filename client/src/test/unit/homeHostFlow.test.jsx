import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { Home } from '../../pages/Home.jsx';

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

function renderHomeAt(path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <PartyModalProvider>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </PartyModalProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Home /?host=1 host flow (H7)', () => {
  beforeEach(() => {
    authLoading = false;
    signInWithGoogle.mockReset();
    signInWithGoogle.mockResolvedValue({ success: true, user: { uid: 'u1' } });
    window.sessionStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('does not call Google sign-in from the host query effect', async () => {
    renderHomeAt('/?host=1');

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    await waitFor(() => {
      expect(signInWithGoogle).not.toHaveBeenCalled();
    });

    const hostCta = await screen.findByRole('button', { name: /host a free game/i });
    expect(hostCta).toHaveAttribute('id', 'host-free-game-cta');
  });

  it('calls Google sign-in exactly once when the user clicks Host a free game', async () => {
    renderHomeAt('/');

    const hostCta = await screen.findByRole('button', { name: /host a free game/i });
    fireEvent.click(hostCta);

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call Google sign-in while auth is still loading', async () => {
    authLoading = true;
    renderHomeAt('/?host=1');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(signInWithGoogle).not.toHaveBeenCalled();
  });
});
