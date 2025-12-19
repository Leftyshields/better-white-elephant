# E2E Tests with Simulation Mode

These end-to-end tests leverage the `?sim=true` URL parameter to access simulation controls and automate game testing.

## Prerequisites

1. Install Playwright:
```bash
npm install -D @playwright/test
npx playwright install
```

2. Start the dev server (or it will auto-start):
```bash
npm run dev
```

3. Set test party ID (optional):
```bash
export TEST_PARTY_ID=your-test-party-id
```

## Running Tests

```bash
# Run all E2E tests
npx playwright test

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific test file
npx playwright test game-simulation.spec.js

# Debug mode
npx playwright test --debug
```

## Test Structure

- `game-simulation.spec.js` - Full game simulation tests using sim mode
- `utils/simModeHelpers.js` - Helper functions for sim mode interactions

## Key Features

- **Automated Bot Addition**: Tests can add bots programmatically
- **Auto-Play**: Enable auto-play to let bots play automatically
- **Audit Trail Access**: Read and validate audit trail entries
- **Game State Inspection**: Access game state via window objects
- **Full Game Cycles**: Run complete games from start to finish

## Example Test Flow

1. Navigate to party with `?sim=true`
2. Wait for socket connection
3. Add bots via simulation controls
4. Enable auto-play
5. Wait for game to complete
6. Validate audit trail
7. Verify game over screen
