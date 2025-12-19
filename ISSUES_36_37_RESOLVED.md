# Issues #36 and #37 - Resolution Summary

## Issue #36: Boomerang pass would not let users steal, only skip

### Problem
In boomerang phase, players could see steal buttons but couldn't actually steal gifts. The system would only allow them to skip their turn, even though they should be able to steal (swap) gifts in boomerang phase.

### Root Causes Identified
1. **Server-side validation issue**: The `canSteal` method in `server/engine.js` was blocking all steals if the player had already acted (`turnAction` was set), even in boomerang phase where players should be able to pick then steal (swap).
2. **Bot decision logic issue**: Bots weren't automatically choosing to steal in boomerang phase because the `isBoomerangPhase` calculation didn't check `returnToStart` config.

### Fixes Applied

#### 1. Server-side `canSteal` fix (`server/engine.js`)
**File**: `server/engine.js`, method `canSteal()`

**Change**: Made the `turnAction` check conditional on boomerang phase and Player 1's final turn:

```javascript
// Before: Blocked all steals if player already acted
if (this.turnAction.get(playerId)) return false;

// After: Only block in standard phase
const isInSecondHalf = this.turnQueue && 
  this.currentTurnIndex >= (this.turnOrder?.length || 0);
const isLastIndex = this.currentTurnIndex === (this.turnQueue.length - 1);
const isPlayer1 = this.turnOrder && this.turnOrder[0] === playerId;
const isPlayer1FinalTurn = isLastIndex && isPlayer1;

if (this.turnAction.get(playerId) && !isInSecondHalf && !isPlayer1FinalTurn) {
  return false; // Already acted this turn (only in standard phase)
}
```

This allows players to steal in boomerang phase even after picking, enabling the swap mechanic.

#### 2. Bot decision logic fix (`server/utils/bot-utils.js`)
**File**: `server/utils/bot-utils.js`, function `botMakeDecision()`

**Change**: Fixed `isBoomerangPhase` calculation to check `returnToStart` config:

```javascript
// Before: Didn't check returnToStart
const isBoomerangPhase = currentTurnIndex >= (turnOrder?.length || 0);

// After: Checks returnToStart first
const returnToStart = config?.returnToStart || false;
const isBoomerangPhase = returnToStart && (
  gameState.isBoomerangPhase || 
  (currentTurnIndex >= (turnOrder?.length || 0))
);
```

This ensures bots correctly identify boomerang phase and automatically choose to steal when they have a gift.

#### 3. Client-side `canSteal` fix (`client/src/components/GameBoard.jsx`)
**File**: `client/src/components/GameBoard.jsx`

**Change**: Made `currentAction` check conditional on boomerang phase:

```javascript
// Before: Blocked all steals if currentAction was set
if (currentAction !== null) return false;

// After: Only block in standard phase
if (currentAction !== null && !isBoomerangPhase && !isPlayer1FinalTurn) {
  return false; // Already acted this turn (only in standard phase)
}
```

### Testing
- ✅ Verified players can steal in boomerang phase after picking
- ✅ Verified bots automatically steal in boomerang phase
- ✅ Verified "Force Steal" works correctly
- ✅ Verified steal buttons appear and are clickable

### Status
✅ **RESOLVED** - Players and bots can now steal in boomerang phase as expected.

---

## Issue #37: Game state resets after second turn

### Problem
After the second turn in a game, the game state would reset, losing progress and causing players to see incorrect game state or have their actions rejected.

### Root Causes Identified
1. **Problematic useEffect**: A `useEffect` in `client/src/hooks/useGameEngine.js` was re-dispatching stale game state when `participants.length` or `gifts.length` changed, causing state resets.
2. **Missing state versioning**: The game state didn't have proper versioning/timestamps to prevent stale state from overwriting newer state on reconnection or reload.
3. **Weak merge logic**: The client-side state merge logic didn't properly reject stale updates.

### Fixes Applied

#### 1. Removed problematic useEffect (`client/src/hooks/useGameEngine.js`)
**File**: `client/src/hooks/useGameEngine.js`

**Change**: Removed a `useEffect` that was re-dispatching stale game state:
- Removed lines that dispatched `gameActions.gameStarted()` or `gameActions.gameUpdated()` when `participants.length` or `gifts.length` changed
- This prevented the state from being reset when these arrays changed

#### 2. Added state versioning (`server/engine.js`, `server/routes/game.js`, `server/utils/game-state-persistence.js`)
**Files**: Multiple server files

**Changes**:
- Added `stateVersion: Date.now()` to game state when created/updated
- Added `updatedAt: new Date().toISOString()` timestamp to game state
- Modified `getState()` method to include versioning
- Modified `saveGameState()` to explicitly set version before saving
- Modified `loadGameState()` to provide backwards compatibility by adding version if missing

#### 3. Improved state merge logic (`client/src/reducers/gameReducer.js`)
**File**: `client/src/reducers/gameReducer.js`

**Change**: Added robust version checking to prevent stale updates:

```javascript
const incomingVersion = gameState?.stateVersion || 
  (gameState?.updatedAt ? new Date(gameState.updatedAt).getTime() : 0);
const currentVersion = state.gameState?.stateVersion || 
  (state.gameState?.updatedAt ? new Date(state.gameState.updatedAt).getTime() : 0);

// Fallback: Use history length + currentTurnIndex as version
const incomingFallbackVersion = incomingVersion || 
  ((gameState?.history?.length || 0) * 1000 + (gameState?.currentTurnIndex || 0));
const currentFallbackVersion = currentVersion || 
  ((state.gameState?.history?.length || 0) * 1000 + (state.currentTurnIndex || -1));

// Only update if incoming state is newer
if (action.type !== ActionTypes.GAME_STARTED && 
    incomingFallbackVersion > 0 && 
    currentFallbackVersion > 0 && 
    incomingFallbackVersion < currentFallbackVersion) {
  console.warn('[GameReducer] ⚠️ Rejecting stale game state update');
  return state; // Reject stale update
}
```

This ensures that only newer state updates are accepted, preventing resets from stale data.

#### 4. Added GET endpoint for game state (`server/routes/game.js`)
**File**: `server/routes/game.js`

**Change**: Added `GET /api/game/state/:partyId` endpoint to allow clients (like TanStack Query) to fetch current game state, enabling better state synchronization.

### Testing
- ✅ Verified game state persists correctly after multiple turns
- ✅ Verified state doesn't reset on page reload
- ✅ Verified stale state is rejected when newer state exists
- ✅ Verified state versioning works correctly

### Status
✅ **RESOLVED** - Game state now persists correctly across turns and reconnections.

---

## Files Modified

### Issue #36
- `server/engine.js` - Fixed `canSteal()` method
- `server/utils/bot-utils.js` - Fixed bot decision logic
- `client/src/components/GameBoard.jsx` - Fixed client-side `canSteal()` logic

### Issue #37
- `client/src/hooks/useGameEngine.js` - Removed problematic useEffect
- `server/engine.js` - Added state versioning
- `server/routes/game.js` - Added versioning and GET endpoint
- `server/utils/game-state-persistence.js` - Added versioning support
- `client/src/reducers/gameReducer.js` - Improved state merge logic

## Additional Notes

- Both fixes maintain backwards compatibility with existing game states
- Debug instrumentation was added and kept for future debugging (no localhost URLs)
- All changes follow existing code patterns and architecture
- State versioning uses both timestamps and fallback mechanisms for robustness

