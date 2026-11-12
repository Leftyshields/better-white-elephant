# Testing Guide

This document describes the automated testing setup for Better White Elephant, which leverages simulation mode (`?sim=true`) for comprehensive frontend testing focused on **perfect gameplay outcomes** - ensuring games complete successfully with proper rule compliance and state integrity.

## Testing Stack

### Unit & Integration Tests
- **Vitest**: Fast unit test runner (Vite-native)
- **React Testing Library**: Component testing
- **jsdom**: DOM environment for tests

### End-to-End Tests
- **Playwright**: Browser automation and E2E testing
- **Simulation Mode**: Leverages `?sim=true` for game control

## Setup

### Prerequisites

1. **Backend server must be running** - The E2E tests require the backend server to be running for automated party creation
   ```bash
   # In a separate terminal
   cd server
   npm start
   ```

2. **Firebase configuration** - Ensure Firebase Admin SDK is configured with proper credentials in `server/.env`

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

**Important**: The backend server must be running before running E2E tests. Tests automatically create parties via the test API endpoint.

```bash
# Ensure backend server is running (in a separate terminal)
cd server && npm start

# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests (headless mode)
npm run test:e2e

# UI mode (interactive) - requires display/X server
# On headless servers, uses xvfb-run automatically
npm run test:e2e:ui

# Debug mode - requires display/X server
# On headless servers, uses xvfb-run automatically
npm run test:e2e:debug
```

**Environment Variables**:
- `TEST_PARTY_ID`: Optional - If set, tests will use this existing party ID instead of creating a new one (useful for debugging specific parties)
- `TEST_SERVER_URL`: Optional - Backend server URL (defaults to `http://localhost:3001`)

**Note for Headless Servers**: The `test:e2e:ui` and `test:e2e:debug` commands automatically use `xvfb-run` to provide a virtual display and bind to `0.0.0.0:9323` to allow remote access.

**⚠️ Important**: Playwright UI mode on headless servers has limitations:
- The UI web server is accessible and you can **browse and view tests**
- **Interactive test execution may not work** - the test runner view may show `about:blank` because Playwright UI requires local browser automation
- **For actual test execution on headless servers, use `npm run test:e2e` (headless mode)** - this works perfectly

On headless servers:
- **Recommended**: Use `npm run test:e2e` for regular headless testing (no display needed)
- **For UI Mode**: Playwright UI mode starts a web server on port 9323, bound to `0.0.0.0` for network access. To access it:
  1. Run `npm run test:e2e:ui` - wait for it to show "View test UI at http://localhost:9323" in the terminal
  2. Access the UI from your local machine via one of these methods:
     - **Same network (recommended)**: Open `http://sandbox-mac-mini.local:9323` in your browser
     - **SSH port forwarding**: `ssh -L 9323:localhost:9323 user@your-server`, then open `http://localhost:9323`
     - **Direct IP**: `http://your-server-ip:9323` (if ports are open)

**Troubleshooting UI Mode**:
- If you see `ERR_EMPTY_RESPONSE`: The UI server may still be starting. Wait 10-30 seconds after running the command and check the terminal output for the actual URL. Make sure you're accessing the correct hostname/port.
- If the server doesn't start: Check that `xvfb` is installed (`sudo apt-get install xvfb` on Ubuntu/Debian)
- Server not accessible: The UI is configured to bind to `0.0.0.0:9323` in `playwright.config.js`. Ensure your firewall allows connections on port 9323
- Change port/host: Set environment variables `PLAYWRIGHT_UI_HOST` and `PLAYWRIGHT_UI_PORT`, or modify the `ui` section in `playwright.config.js`

## Automated Party Creation

E2E tests automatically create parties before running using a dedicated test API endpoint. This ensures tests have valid parties to work with without manual setup.

### How It Works

1. **Test API Endpoint**: `POST /api/test/party`
   - Uses Firebase Admin SDK to create parties (bypasses Firestore security rules)
   - Only available in development/test environments (protected by `NODE_ENV` check)
   - Creates party with default configuration: status='LOBBY', maxSteals=3, returnToStart=false

2. **Test Helper Function**: `createTestPartyViaAPI(page, options)`
   - Located in `client/src/test/e2e/utils/partyHelpers.js`
   - Called automatically in each test's `beforeEach` hook
   - Falls back to UI-based creation if API is unavailable

3. **Test Setup**:
   - Each test file creates a new party in `beforeEach` (unless `TEST_PARTY_ID` env var is set)
   - Party ID is stored and used throughout the test
   - Tests can optionally pass custom party configuration (title, date, config)

### API Endpoint Details

**Endpoint**: `POST /api/test/party`

**Request Body** (optional):
```json
{
  "adminId": "test-user-id",
  "title": "My Test Party",
  "date": "2024-12-25",
  "config": {
    "maxSteals": 3,
    "returnToStart": false,
    "priceLimit": null
  }
}
```

**Response**:
```json
{
  "success": true,
  "partyId": "abc123...",
  "adminId": "test-admin-..."
}
```

**Security**: The endpoint is protected and only works in development/test environments. In production, it requires a `X-Test-Secret` header.

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
│           │   ├── happy-path.spec.js          # Complete game flows
│           │   ├── common-behaviors.spec.js    # Pick, steal, skip behaviors
│           │   ├── rule-compliance.spec.js     # Rule validation
│           │   ├── state-integrity.spec.js     # State consistency
│           │   ├── edge-cases.spec.js          # Boundary conditions
│           │   └── game-simulation.spec.js     # Basic sim mode tests
│           └── utils/            # E2E helpers
│               ├── simModeHelpers.js   # Simulation mode utilities
│               ├── gameHelpers.js      # Game setup and state helpers
│               └── assertionHelpers.js # Perfect outcome assertions
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

### E2E Test Example - Perfect Gameplay Outcome

```javascript
import { test, expect } from '@playwright/test';
import { startGameWithBots, enableAutoPlay } from '../utils/gameHelpers';
import {
  assertGameCompleted,
  assertAllGiftsOwned,
  assertNoDuplicates,
  assertNoErrors,
  assertStateConsistent,
} from '../utils/assertionHelpers';

test('5-player game completes with perfect outcome', async ({ page }) => {
  // Setup: Start game with bots
  await startGameWithBots(page, partyId, 5);
  await enableAutoPlay(page);
  
  // Wait: Game completes
  await page.waitForSelector('text=/game over/i', { timeout: 120000 });
  
  // Validate: Perfect gameplay outcome
  await assertGameCompleted(page);
  await assertAllGiftsOwned(page);
  await assertNoDuplicates(page);
  await assertNoErrors(page);
  await assertStateConsistent(page);
});
```

### Test Categories

#### Happy Path Tests (`happy-path.spec.js`)
- Complete games from start to finish
- Various player counts (3, 5, 8, 11)
- Standard and boomerang modes
- Validate successful completion with no errors

#### Common Behavior Tests (`common-behaviors.spec.js`)
- Pick wrapped gift
- Steal unwrapped gift
- Skip turn (with gift)
- Multiple steals on same gift (up to max)
- Gift locking after max steals
- Boomerang phase swapping

#### Rule Compliance Tests (`rule-compliance.spec.js`)
- U-turn rule (can't steal back immediately)
- Max steals rule (gift locks after limit)
- Double-dip prevention (can't steal if have gift in standard phase)
- Boomerang swapping (can swap in boomerang)
- Victim chain (victim becomes active after steal)

#### State Integrity Tests (`state-integrity.spec.js`)
- Gift ownership consistency throughout game
- Turn order progression
- Game state synchronization with UI
- Audit trail accuracy
- No duplicate ownership at any point

#### Edge Case Tests (`edge-cases.spec.js`)
- Minimum players (3)
- Maximum players (11)
- All players skip
- Rapid consecutive actions
- Game reset during play
- Socket reconnection scenarios
- Concurrent state updates

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

## Perfect Gameplay Validation

Every E2E test should validate these outcomes:

1. **Game Completion**: Game reaches ENDED state successfully
2. **All Gifts Owned**: Every gift has exactly one owner
3. **No Duplicates**: No player owns multiple gifts
4. **No Errors**: Audit trail contains no ERROR entries
5. **Rules Followed**: All game rules enforced correctly
6. **State Consistent**: Game state remains valid throughout

### Using Assertion Helpers

```javascript
import {
  assertGameCompleted,
  assertAllGiftsOwned,
  assertNoDuplicates,
  assertNoErrors,
  assertStateConsistent,
  assertRulesFollowed,
} from '../utils/assertionHelpers';

// After game completes, validate perfect outcome
await assertGameCompleted(page);
await assertAllGiftsOwned(page);
await assertNoDuplicates(page);
await assertNoErrors(page);
await assertStateConsistent(page);
await assertRulesFollowed(page, { maxSteals: 3 });
```

## Best Practices

1. **Use Sim Mode for E2E**: Always use `?sim=true` for automated game testing
2. **Validate Perfect Outcomes**: Always check for completion, ownership, no duplicates, no errors
3. **Isolate Tests**: Each test should be independent
4. **Mock External Services**: Mock Firebase, Socket.io for unit tests
5. **Use Helpers**: Leverage helper utilities for common operations
6. **Validate State Continuously**: Check state integrity at multiple points during long-running tests
7. **Use Audit Trail**: Analyze audit trail for rule compliance and errors
8. **Clean Up**: Reset game state between tests

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
