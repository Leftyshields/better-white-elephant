/**
 * Landing marketing copy and routing regressions (Copywriter Nov 11 2026)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Home } from '../../pages/Home.jsx';
import { HowToPlay } from '../../pages/HowToPlay.jsx';
import { Rules } from '../../pages/Rules.jsx';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { SoundProvider } from '../../contexts/SoundContext.jsx';
import {
  HERO_SUBHEAD,
  HOST_CTA_MICROLINE,
  HOST_CTA_PRIMARY_LABEL,
  HOST_CTA_SECONDARY_LABEL,
  LANDING_FEATURE_CARDS,
  REMOTE_TEAM_HR_LINE,
  RULES_STEAL_FREEZE_COPY,
} from '../../content/landingMarketingCopy.js';

const signInWithGoogle = vi.fn(() => Promise.resolve({ success: true }));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: null,
    signInWithGoogle,
    signInWithEmailAndPassword: vi.fn(),
    signUpWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../components/Snowflakes.jsx', () => ({
  Snowflakes: () => null,
}));

vi.mock('../../components/Footer.jsx', () => ({
  Footer: () => <footer data-testid="marketing-footer">Footer</footer>,
}));

vi.mock('../../components/SEO.jsx', () => ({
  SEO: () => null,
}));

vi.mock('../../utils/analytics.js', () => ({
  trackCreateParty: vi.fn(),
  trackSignUp: vi.fn(),
  trackLogin: vi.fn(),
  trackButtonClick: vi.fn(),
  trackGameAbandoned: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  collectionGroup: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
}));

function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <SoundProvider>
      <PartyModalProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </PartyModalProvider>
    </SoundProvider>
  );
}

describe('Landing marketing (signed-out)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('shows primary Host a free game CTA, secondary See how it works, and free microline', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    );

    expect(screen.getByRole('button', { name: HOST_CTA_PRIMARY_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: HOST_CTA_SECONDARY_LABEL })).toHaveAttribute('href', '/how-to-play');
    expect(screen.getByText(HOST_CTA_MICROLINE)).toBeInTheDocument();
    expect(screen.getByText(HERO_SUBHEAD)).toBeInTheDocument();
  });

  it('renders each feature card title once in the document', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    );

    const featuresRoot = document.getElementById('features-section');
    expect(featuresRoot).toBeTruthy();

    LANDING_FEATURE_CARDS.forEach((feature) => {
      const matches = within(featuresRoot).getAllByText(feature.title);
      expect(matches).toHaveLength(1);
    });

    expect(within(featuresRoot).getAllByText(/Live Reactions/i)).toHaveLength(1);
    expect(within(featuresRoot).getAllByText(/Easy Setup/i)).toHaveLength(1);
    expect(within(featuresRoot).getAllByText(/Auto-Pilot Logistics/i)).toHaveLength(1);
  });

  it('uses Copywriter logistics and HR lines in the landing body', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    );

    expect(screen.getByText(LANDING_FEATURE_CARDS[2].body)).toBeInTheDocument();
    expect(screen.getByText(REMOTE_TEAM_HR_LINE)).toBeInTheDocument();
  });
});

describe('How to play and rules routes', () => {
  it('/how-to-play renders rules body with How to Play heading', () => {
    renderWithProviders(
      <Routes>
        <Route path="/how-to-play" element={<HowToPlay />} />
      </Routes>,
      { route: '/how-to-play' }
    );

    expect(screen.getByRole('heading', { level: 1, name: 'How to Play' })).toBeInTheDocument();
    expect(screen.getByText('The Basics')).toBeInTheDocument();
    expect(screen.getByText(RULES_STEAL_FREEZE_COPY)).toBeInTheDocument();
  });

  it('/rules renders rules body with Rules heading', () => {
    renderWithProviders(
      <Routes>
        <Route path="/rules" element={<Rules />} />
      </Routes>,
      { route: '/rules' }
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByText('Core Rules')).toBeInTheDocument();
  });
});
