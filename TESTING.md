# Testing Guide

This document describes the automated testing setup for Better White Elephant, which leverages simulation mode (`?sim=true`) for comprehensive frontend testing.

## Testing Stack

### Unit & Integration Tests
- **Vitest**: Fast unit test runner (Vite-native)
- **React Testing Library**: Component testing
- **jsdom**: DOM environment for tests

### End-to-End Tests
- **Playwright**: Browser automation and E2E testing
- **Simulation Mode**: Leverages `?sim=true` for game control

## Setup

### Install Dependencies

```bash
cd client
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

### Run Unit Tests

```bash
# Run all unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Run E2E Tests

```bash
# Install Playwright browsers
npx playwright install

# Run E2E tests
npm run test:e2e

# UI mode (interactive)
npx playwright test --ui
```

## Simulation Mode Testing

Simulation mode (`?sim=true`) enables:

- **Bot Management**: Add/remove bots programmatically
- **Auto-Play**: Automate bot turns
- **Game Control**: Force bot moves, reset games
- **Audit Trail**: Access detailed game logs
- **State Inspection**: Access game state for validation

### Using Sim Mode in Tests

#### E2E Tests (Playwright)

```javascript
import { navigateToSimMode, addBots, enableAutoPlay } from '../utils/simModeHelpers';

test('should complete a game with bots', async ({ page }) => {
  await navigateToSimMode(page, 'party-id');
  await addBots(page, 5);
  await enableAutoPlay(page);
  await waitForGameFinish(page);
});
```

#### Unit Tests (Vitest)

```javascript
// Set sim=true in URL
Object.defineProperty(window, 'location', {
  value: { search: '?sim=true' },
  writable: true,
});

// Test component with sim mode
render(<SimulationControls socket={mockSocket} partyId="test" />);
```

## Test Structure

```
client/
├── src/
│   └── test/
│       ├── setup.js              # Test configuration
│       ├── utils/
│       │   └── testHelpers.js    # Unit test utilities
│       ├── unit/                 # Unit tests
│       │   └── *.test.jsx
│       └── e2e/                  # E2E tests
│           ├── tests/            # Test specs
│           └── utils/            # E2E helpers
│               └── simModeHelpers.js
```

## Writing Tests

### Unit Test Example

```javascript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimulationControls } from '../../components/dev/SimulationControls';

describe('SimulationControls', () => {
  it('renders in sim mode', () => {
    // Setup sim mode
    window.location.search = '?sim=true';
    
    render(<SimulationControls socket={mockSocket} partyId="test" />);
    expect(screen.getByText(/SIM TOOLS/i)).toBeInTheDocument();
  });
});
```

### E2E Test Example

```javascript
import { test, expect } from '@playwright/test';
import { navigateToSimMode, addBots, waitForGameFinish } from '../utils/simModeHelpers';

test('should play complete game with auto-play', async ({ page }) => {
  await navigateToSimMode(page, 'test-party-id');
  await addBots(page, 5);
  await enableAutoPlay(page);
  await waitForGameFinish(page);
  
  expect(await page.getByText(/game over/i)).toBeVisible();
});
```

## CI/CD Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Run unit tests
  run: |
    cd client
    npm run test

- name: Run E2E tests
  run: |
    cd client
    npx playwright test
```

## Best Practices

1. **Use Sim Mode for E2E**: Always use `?sim=true` for automated game testing
2. **Isolate Tests**: Each test should be independent
3. **Mock External Services**: Mock Firebase, Socket.io for unit tests
4. **Use Helpers**: Leverage `simModeHelpers` for common operations
5. **Validate State**: Use audit trail to verify game state correctness
6. **Clean Up**: Reset game state between tests

## Debugging Tests

### Unit Tests
```bash
# Run with UI
npm run test:ui

# Debug specific test
npm run test -- SimulationControls.test.jsx
```

### E2E Tests
```bash
# Headed mode (see browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug

# Trace viewer
npx playwright show-trace trace.zip
```

## Coverage Goals

- Unit tests: >80% coverage for hooks, reducers, utilities
- Component tests: All critical components
- E2E tests: Full game flows, bot interactions, audit trail
