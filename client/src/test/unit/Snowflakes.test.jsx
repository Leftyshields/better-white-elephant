/**
 * Snowflake styles must stay stable when unrelated parent state re-renders
 * (e.g. the landing hero gameState ticker every 3.5s).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Snowflakes, SnowflakesInner } from '../../components/Snowflakes.jsx';

function SnowWithRerenderTrigger({ variant }) {
  const [, bump] = useState(0);
  return (
    <>
      <button type="button" onClick={() => bump((n) => n + 1)}>
        Re-render parent
      </button>
      <Snowflakes variant={variant} />
    </>
  );
}

function collectFlakeInlineStyles() {
  return screen.getAllByText('❄').map((node) => node.getAttribute('style'));
}

describe('Snowflakes', () => {
  it('keeps landing snowflake inline styles when Snowflakes re-renders', () => {
    const { rerender } = render(<SnowflakesInner variant="landing" />);

    expect(screen.getAllByText('❄')).toHaveLength(120);

    const stylesBefore = collectFlakeInlineStyles();

    rerender(<SnowflakesInner variant="landing" />);

    const stylesAfter = collectFlakeInlineStyles();
    stylesAfter.forEach((style, index) => {
      expect(style).toBe(stylesBefore[index]);
    });
  });

  it('keeps signed-in snowflake inline styles when Snowflakes re-renders', () => {
    const { rerender } = render(<SnowflakesInner variant="signedIn" />);

    expect(screen.getAllByText('❄')).toHaveLength(40);

    const stylesBefore = collectFlakeInlineStyles();

    rerender(<SnowflakesInner variant="signedIn" />);

    const stylesAfter = collectFlakeInlineStyles();
    stylesAfter.forEach((style, index) => {
      expect(style).toBe(stylesBefore[index]);
    });
  });

  it('keeps landing snowflake inline styles when an ancestor re-renders', () => {
    render(<SnowWithRerenderTrigger variant="landing" />);

    const stylesBefore = collectFlakeInlineStyles();

    fireEvent.click(screen.getByRole('button', { name: /re-render parent/i }));

    const stylesAfter = collectFlakeInlineStyles();
    stylesAfter.forEach((style, index) => {
      expect(style).toBe(stylesBefore[index]);
    });
  });
});
