# Frontend Architecture Specification

## Overview
This document maps the complete frontend architecture, component hierarchy, routing, and state management for the White Elephant game application.

## Routing Structure

### App.jsx (Root Router)
```
App
├── SoundProvider (Context)
├── PartyModalProvider (Context)
└── BrowserRouter
    ├── Header (Global)
    └── Routes
        ├── / → Home.jsx
        ├── /party/:partyId → Party.jsx
        └── /profile → Profile.jsx
```

**Key Routes:**
- `/` - Home page (party list, create party)
- `/party/:partyId` - Party page (routes to lobby or game)
- `/profile` - User profile page

## Component Hierarchy

### Party.jsx (Page Component)
**Location:** `client/src/pages/Party.jsx`

**Purpose:** Router component that decides what to render based on party status

**Conditional Rendering:**
```javascript
if (party.status === 'ACTIVE' || party.status === 'ENDED' || gameStarted) {
  return <GameBoard partyId={partyId} />;
}
return <PartyLobby partyId={partyId} onStartGame={() => setGameStarted(true)} />;
```

**State Management:**
- Uses `useParty(partyId)` hook for party data
- Uses `useAuth()` for user authentication
- Local state: `gameStarted` (boolean)

**Key Decision Point:**
- **ACTIVE/ENDED status** → Renders `GameBoard`
- **LOBBY status** → Renders `PartyLobby`

---

### GameBoard.jsx (Main Game Component)
**Location:** `client/src/pages/GameBoard.jsx` (NOTE: Actually in `components/` folder)

**Purpose:** Main game interface - handles all game state and UI

**State Management:**
- Uses `useGameSocket(partyId)` hook
  - Returns: `{ gameState, pickGift, stealGift, endTurn, connected, socket, emitReaction }`
- Uses `useParty(partyId)` hook for party data
- Uses `useAuth()` for user data
- Local state: `userNames`, `userEmails`, `revealingGiftId`, etc.

**Game State Source:**
- `gameState` comes from `useGameSocket` hook
- `gameState` structure:
  ```javascript
  {
    phase: 'ACTIVE' | 'ENDED' | 'LOBBY',
    currentPlayerId: string,
    currentTurnIndex: number,
    currentVictim: string | null,
    turnQueue: string[],
    turnOrder: string[],
    wrappedGifts: string[],
    unwrappedGifts: Array<[giftId, giftData]>,
    history: Array<{type, playerId, giftId, ...}>,
    config: { maxSteals, returnToStart },
    isBoomerangPhase: boolean
  }
  ```

**Render Conditions:**
1. **Early Returns (Before Main Render):**
   - `if (!connected || !gameState)` → Loading screen
   - `if (gameStateTimeout)` → Error screen
   - `if (party?.status === 'ENDED')` → Ended game screen (Firestore-based)
   - `if (isGameEndedFromState || phase === 'ENDED')` → Ended game screen (gameState-based)

2. **Main Render (Active Game):**
   - Turn indicator HUD
   - Wrapped gifts section
   - Unwrapped gifts (GiftCard components)
   - Game Audit Trail
   - Simulation Controls (if ?sim=true)
   - Navigation button

**Component Structure:**
```jsx
<GameBoard>
  {/* Early returns for loading/error/ended states */}
  
  {/* Main game render */}
  <div className="max-w-6xl mx-auto p-6">
    {/* Turn Indicator HUD */}
    {/* Wrapped Gifts */}
    {/* Unwrapped Gifts Grid */}
    
    {/* Play-by-Play Feed - SHOULD BE HERE */}
    <GamePlayByPlay />
    
    {/* Game Audit Trail */}
    <GameAuditTrail />
    
    {/* Simulation Controls */}
    <SimulationControls />
  </div>
</GameBoard>
```

---

### GameRoom.jsx (UNUSED)
**Location:** `client/src/pages/GameRoom.jsx`

**Status:** ⚠️ **NOT USED IN ROUTING**

**Note:** This component exists but is never rendered. The app uses `GameBoard.jsx` instead.

**If you want to use GameRoom:**
- It uses `useGameEngine` hook (reducer-based state)
- Would need to update `Party.jsx` to import and use `GameRoom` instead of `GameBoard`

---

## State Management Architecture

### Two State Management Systems

#### 1. GameBoard.jsx (Currently Used)
- **Hook:** `useGameSocket(partyId)`
- **State Source:** Socket.io events + Redis/Firestore
- **State Structure:** Server-provided `gameState` object
- **Updates:** Real-time via socket events (`game-started`, `game-updated`, `game-ended`)

#### 2. GameRoom.jsx (Unused)
- **Hook:** `useGameEngine(partyId)`
- **State Source:** Reducer (`gameReducer.js`) + Socket.io
- **State Structure:** Normalized client state with optimistic updates
- **Updates:** Optimistic updates + server confirmation

---

## Component Placement for GamePlayByPlay

### Current Status
- ✅ Component exists: `client/src/components/GamePlayByPlay.jsx`
- ✅ Imported in `GameBoard.jsx`: Line 18
- ✅ Added to render: Line 937-954
- ❌ **NOT VISIBLE** - Likely inside a conditional that prevents rendering

### Correct Placement

**Location:** `client/src/components/GameBoard.jsx`

**Should be placed in the MAIN ACTIVE GAME render section**, NOT in:
- Early return conditions
- Ended game screen
- Loading/error screens

**Exact Location:**
After line ~1000 (after the turn indicator HUD, before GameAuditTrail)

**Code Structure:**
```jsx
// Around line 1000-1100 in GameBoard.jsx
return (
  <div className="max-w-6xl mx-auto p-6">
    {/* Turn Indicator HUD */}
    <div>...</div>
    
    {/* Wrapped Gifts */}
    <div>...</div>
    
    {/* Unwrapped Gifts Grid */}
    <div>...</div>
    
    {/* ✅ PLAY-BY-PLAY SHOULD BE HERE */}
    <div className="w-full mb-8">
      <GamePlayByPlay
        state={{
          status: gameState?.phase === 'ACTIVE' ? 'PLAYING' : gameState?.phase === 'ENDED' ? 'FINISHED' : 'LOBBY',
          turnQueue: gameState?.turnQueue || [],
          currentTurnIndex: gameState?.currentTurnIndex ?? -1,
          pendingVictimId: gameState?.currentVictim || null,
          activePlayerId: gameState?.currentPlayerId || null,
          gifts: gifts.reduce((acc, g) => ({ ...acc, [g.id]: g }), {}),
          activities: gameState?.history || [],
          gameState: gameState,
        }}
        userNames={userNames}
        userEmails={userEmails}
      />
    </div>
    
    {/* Game Audit Trail */}
    <GameAuditTrail />
  </div>
);
```

---

## Key Files Reference

### Pages
- `client/src/pages/Party.jsx` - Router component (decides GameBoard vs PartyLobby)
- `client/src/pages/Home.jsx` - Home page
- `client/src/pages/Profile.jsx` - Profile page
- `client/src/pages/GameRoom.jsx` - **UNUSED** (alternative game component)

### Components
- `client/src/components/GameBoard.jsx` - **MAIN GAME COMPONENT** (currently used)
- `client/src/components/GamePlayByPlay.jsx` - Play-by-play feed component
- `client/src/components/GameAuditTrail.jsx` - Game history component
- `client/src/components/GameTicker.jsx` - Live activity ticker
- `client/src/components/PartyLobby.jsx` - Pre-game lobby

### Hooks
- `client/src/hooks/useGameSocket.js` - Socket.io connection + game state (used by GameBoard)
- `client/src/hooks/useGameEngine.js` - Reducer-based state management (used by GameRoom - unused)
- `client/src/hooks/useParty.js` - Party data from Firestore
- `client/src/hooks/useAuth.js` - Authentication

---

## Debugging Checklist

If `GamePlayByPlay` is not visible:

1. ✅ **Check import:** `import { GamePlayByPlay } from './GamePlayByPlay.jsx';`
2. ✅ **Check component exists:** File at `client/src/components/GamePlayByPlay.jsx`
3. ✅ **Check export:** `export function GamePlayByPlay({ state, userNames, userEmails })`
4. ❓ **Check render location:** Is it inside a conditional that prevents rendering?
5. ❓ **Check gameState:** Is `gameState` null/undefined when component tries to render?
6. ❓ **Check browser console:** Any JavaScript errors?
7. ❓ **Check network:** Is the component file being loaded?

---

## State Mapping for GamePlayByPlay

**GameBoard's `gameState` → GamePlayByPlay's `state` prop:**

```javascript
{
  status: gameState?.phase === 'ACTIVE' ? 'PLAYING' 
         : gameState?.phase === 'ENDED' ? 'FINISHED' 
         : 'LOBBY',
  turnQueue: gameState?.turnQueue || [],
  currentTurnIndex: gameState?.currentTurnIndex ?? -1,
  pendingVictimId: gameState?.currentVictim || null,
  activePlayerId: gameState?.currentPlayerId || null,
  gifts: gifts.reduce((acc, g) => ({ ...acc, [g.id]: g }), {}),
  activities: gameState?.history || [],
  gameState: gameState, // Raw gameState for reference
}
```

---

## Next Steps to Fix GamePlayByPlay

1. **Verify placement:** Ensure it's in the main active game render (not in early returns)
2. **Add debug logging:** Console.log to verify component is called
3. **Check gameState:** Verify `gameState` exists when component renders
4. **Force visibility:** Add a test div with bright colors to verify render location
5. **Check CSS:** Ensure no `display: none` or `visibility: hidden` styles

---

## Summary

- **Active Component:** `GameBoard.jsx` (in `components/` folder, not `pages/`)
- **Router:** `Party.jsx` conditionally renders `GameBoard` when game is ACTIVE/ENDED
- **State Source:** `useGameSocket` hook provides `gameState` object
- **GamePlayByPlay Location:** Should be in main render section of `GameBoard.jsx`, after gifts grid, before audit trail


