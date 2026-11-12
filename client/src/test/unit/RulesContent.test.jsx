import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RulesContent } from '../../components/RulesContent.jsx';
import { LANDING_COPY } from '../../utils/landingMarketingCopy.js';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithGoogle: vi.fn(),
  }),
}));

describe('RulesContent host CTA', () => {
  it('links to home and starts host flow on click without nesting a button inside a link', () => {
    render(
      <MemoryRouter>
        <PartyModalProvider>
          <RulesContent pageHeading="Rules" />
        </PartyModalProvider>
      </MemoryRouter>,
    );

    const cta = screen.getByRole('link', { name: LANDING_COPY.primaryCta });
    expect(cta).toHaveAttribute('href', '/');
    expect(cta.querySelector('button')).toBeNull();
  });
});
