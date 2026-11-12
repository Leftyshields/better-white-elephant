import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RulesContent } from '../../components/RulesContent.jsx';
import { LANDING_COPY } from '../../utils/landingMarketingCopy.js';

describe('RulesContent host CTA', () => {
  it('links to the host flow without nesting a button inside a link', () => {
    render(
      <MemoryRouter>
        <RulesContent pageHeading="Rules" />
      </MemoryRouter>,
    );

    const cta = screen.getByRole('link', { name: LANDING_COPY.primaryCta });
    expect(cta).toHaveAttribute('href', '/?host=1');
    expect(cta.querySelector('button')).toBeNull();
  });
});
