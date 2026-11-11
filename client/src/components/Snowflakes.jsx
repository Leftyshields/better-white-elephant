import { memo, useState } from 'react';

function createLandingSnowflakes() {
  const flakes = [];

  for (let i = 0; i < 50; i++) {
    const randomDelay = Math.random() * 1;
    const randomTop = Math.random() * 120 - 20;
    const baseOpacity = 0.6 + Math.random() * 0.2;
    flakes.push({
      key: `snow-1-${i}`,
      className: 'absolute animate-snow-fall snowflake-mobile',
      style: {
        left: `${(i * 2) % 100}%`,
        top: `${randomTop}%`,
        fontSize: `${Math.random() * 8 + 10}px`,
        opacity: baseOpacity,
        animationDelay: `${randomDelay}s`,
        animationDuration: `${15 + Math.random() * 10}s`,
        color: '#ffffff',
        textShadow:
          '0 0 4px rgba(255, 255, 255, 0.8), 0 0 8px rgba(255, 255, 255, 0.4)',
        filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.8))',
      },
    });
  }

  for (let i = 0; i < 40; i++) {
    const randomDelay = Math.random() * 1;
    const randomTop = Math.random() * 120 - 20;
    const baseOpacity = 0.4 + Math.random() * 0.2;
    flakes.push({
      key: `snow-2-${i}`,
      className: 'absolute animate-snow-fall snowflake-mobile',
      style: {
        left: `${(i * 2.5) % 100}%`,
        top: `${randomTop}%`,
        fontSize: `${Math.random() * 6 + 8}px`,
        opacity: baseOpacity,
        animationDelay: `${randomDelay}s`,
        animationDuration: `${20 + Math.random() * 10}s`,
        color: '#ffffff',
        textShadow:
          '0 0 4px rgba(255, 255, 255, 0.6), 0 0 8px rgba(255, 255, 255, 0.3)',
        filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.6))',
      },
    });
  }

  for (let i = 0; i < 30; i++) {
    const randomDelay = Math.random() * 1;
    const randomTop = Math.random() * 120 - 20;
    const baseOpacity = 0.2 + Math.random() * 0.2;
    flakes.push({
      key: `snow-3-${i}`,
      className: 'absolute animate-snow-fall snowflake-mobile',
      style: {
        left: `${(i * 3.33) % 100}%`,
        top: `${randomTop}%`,
        fontSize: `${Math.random() * 4 + 6}px`,
        opacity: baseOpacity,
        animationDelay: `${randomDelay}s`,
        animationDuration: `${25 + Math.random() * 10}s`,
        color: '#ffffff',
        textShadow:
          '0 0 4px rgba(255, 255, 255, 0.4), 0 0 8px rgba(255, 255, 255, 0.2)',
        filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.4))',
      },
    });
  }

  return flakes;
}

function createSignedInSnowflakes() {
  const flakes = [];
  for (let i = 0; i < 40; i++) {
    const size = Math.random() * 12 + 8;
    const opacity = Math.random() * 0.3 + 0.2;
    const randomDelay = Math.random() * 1;
    const randomTop = Math.random() * 120 - 20;
    flakes.push({
      key: String(i),
      className: 'absolute animate-float snowflake-mobile',
      style: {
        left: `${Math.random() * 100}%`,
        top: `${randomTop}%`,
        fontSize: `${size}px`,
        opacity,
        animationDelay: `${randomDelay}s`,
        animationDuration: `${10 + Math.random() * 8}s`,
        color: '#ffffff',
        textShadow:
          '0 0 4px rgba(255, 255, 255, 0.6), 0 0 8px rgba(255, 255, 255, 0.3)',
        filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.6))',
      },
    });
  }
  return flakes;
}

export function SnowflakesInner({ variant = 'landing' }) {
  const [flakes] = useState(() =>
    variant === 'signedIn' ? createSignedInSnowflakes() : createLandingSnowflakes()
  );

  return (
    <div className="fixed inset-0 overflow-visible pointer-events-none z-[5]">
      {flakes.map(({ key, className, style }) => (
        <div key={key} className={className} style={style}>
          ❄
        </div>
      ))}
    </div>
  );
}

export const Snowflakes = memo(SnowflakesInner);
