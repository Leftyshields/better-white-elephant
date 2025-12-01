# White Elephant Game Rules - Complete Specification

## Overview
This document defines the complete set of rules for the White Elephant Gift Exchange game as implemented in the codebase. Use this document to validate game logic and state transitions.

## Game Setup

### Initialization
- **Minimum Players**: 2 participants required
- **Gifts**: Must have at least as many gifts as participants
- **Turn Order**: Randomly shuffled array of player IDs (`turnOrder`)
- **Turn Queue**: Generated based on game mode (see Turn Queue Generation below)
- **Initial State**: All gifts start as "wrapped" (in `wrappedGifts` array)
- **Phase**: Game starts in `ACTIVE` phase

### Turn Queue Generation

#### Standard Mode (Bookend)
- **Queue**: `[P1, P2, P3, ..., P10, P1]`
- **Pattern**: Forward pass through all players, then first player gets a second turn
- **Total Turns**: `turnOrder.length + 1`

#### Boomerang Mode (Snake Draft)
- **Queue**: `[P1, P2, P3, ..., P9, P10, P10, P9, ..., P3, P2, P1]`
- **Pattern**: Forward pass, then reverse pass (last player appears twice at transition)
- **Total Turns**: `turnOrder.length * 2`
- **Boomerang Phase**: Begins when `currentTurnIndex >= turnOrder.length`

## Core Rules

### Rule 1: One Gift Per Person (Double-Dip Prevention)
**Standard Phase (First Half of Queue)**:
- A player **CANNOT** pick a wrapped gift if they already hold an unwrapped gift
- A player **CANNOT** steal if they already hold a gift (stealing is an exchange, but this constraint prevents double-dipping)
- **Exception 1 - Player 1 Final Turn (Bookend Rule)**: The **Final Turn** of Standard Mode (Player 1's second turn at the end of the queue). 
  - When `currentTurnIndex === turnQueue.length - 1` AND the active player is Player 1 (first player in `turnOrder`), Player 1 acts as if in Boomerang phase
  - This allows Player 1 to **pick** or **steal** even though they already hold a gift from Turn 1
  - This is the "bookend" rule: Player 1 gets a second turn at the end of the queue to ensure fairness
  - **Implementation**: Check `isLastIndex = (currentTurnIndex === turnQueue.length - 1)` AND `isPlayer1 = (turnOrder[0] === playerId)`
- **Exception 2**: If wrapped gifts remain, players with gifts CAN pick them to ensure all gifts are claimed

**Boomerang Phase (Second Half of Queue)**:
- Players **CAN** steal even if they hold a gift (this is a "swap" - they exchange their gift for another)
- Players **CAN** pick wrapped gifts even if they hold a gift (to claim remaining gifts)

**Validation**:
- After any action, no player should own more than one gift
- If a player has a gift and tries to pick/steal in standard phase, the move is rejected

### Rule 2: Turn Termination Logic
**After PICK**:
- Player's turn is **OVER** immediately
- `currentTurnIndex` increments to next valid player
- `currentPlayerId` set to next player in queue
- Next player must not already have a gift (in standard phase)

**After STEAL**:
- Player's turn is **PAUSED** (steal chain begins)
- `currentTurnIndex` does **NOT** increment
- `currentPlayerId` set to victim (`previousOwnerId`)
- Victim becomes active player and can pick or steal
- Turn order resumes only after victim picks a new gift (or steals)

**After END_TURN (Skip)**:
- Player's turn is **OVER**
- `currentTurnIndex` increments to next valid player
- `currentPlayerId` set to next player in queue

### Rule 3: Holding Constraint
**Standard Phase**:
- If a player holds a gift, they **CANNOT** take any action (pick or steal)
- They must either:
  - Skip their turn (if content with their gift)
  - Wait to be stolen from (then they become active)

**Boomerang Phase**:
- Players **CAN** steal even if they hold a gift (swap mechanism)
- Players **CAN** pick wrapped gifts even if they hold a gift

### Rule 4: Immediate Steal-Back Prevention (U-Turn Rule)
- A player **CANNOT** steal a gift that was just stolen from them on the **SAME turn**
- Once a player acts (picks or steals), they **CAN** steal back gifts they lost
- Check: `gift.lastOwnerId === playerId` AND player hasn't acted this turn → reject move
- After a steal, `gift.lastOwnerId` is set to the previous owner
- When a player acts (picks or steals), all `lastOwnerId` values for gifts they lost are cleared
- This allows players to steal back gifts on their next turn, but prevents immediate "revenge steals"

### Rule 5: Gift Locking (Max Steals)
- Each gift tracks `stealCount`
- When `stealCount >= maxSteals` (default: 3), gift becomes `isFrozen = true`
- Frozen gifts **CANNOT** be stolen
- Frozen gifts can still be owned and viewed
- **CRITICAL**: When a gift is swapped (transferred to a victim during a steal), its `stealCount` **DOES NOT RESET**. It retains its heat level to prevent the "infinite game exploit" where players wash gifts of their steal count.

### Rule 6: Steal Chain Logic
**When a STEAL occurs**:
1. Stealer takes the target gift
2. If stealer had a gift, it is transferred to the victim (exchange)
3. Victim becomes the active player (`currentPlayerId = previousOwnerId`)
4. Turn order is **PAUSED** (`currentTurnIndex` does not increment)
5. Victim can:
   - Pick a new wrapped gift (turn order resumes)
   - Steal from someone else (new steal chain begins)
   - Skip turn (if they have a gift from exchange)

**Turn order resumes** when:
- Victim picks a new gift (PICK action)
- Victim skips their turn (END_TURN action)

### Rule 7: Gift Exchange (Swap)
**When a player with a gift steals**:
- Stealer's old gift is transferred to the victim
- Stealer receives the stolen gift
- Both players end up with exactly one gift
- Victim's old gift (the one stolen) is now owned by stealer
- **CRITICAL**: The swapped gift (stealer's old gift) **retains** its `stealCount` and `isFrozen` state. These values are **NOT reset** to prevent the "infinite game exploit" where players can wash gifts of their heat level by swapping them.

**When a player without a gift steals**:
- Stealer receives the stolen gift
- Victim loses the gift (has no gift)
- Victim becomes active and must pick a new gift

### Rule 8: Game End Conditions

#### Condition A: Normal End
Game ends when **ALL** of the following are true:
1. `currentTurnIndex >= turnQueue.length` (all turns in queue exhausted)
2. `currentPlayerId` has a gift (no pending victims from steal chains)
3. `unwrappedGifts.length >= totalParticipants` (all gifts have been claimed)

#### Condition B: All Gifts Frozen
Game ends when **ALL** of the following are true:
1. `currentTurnIndex >= turnQueue.length` (all turns in queue exhausted)
2. All unwrapped gifts have `isFrozen === true` (no more steals possible)
3. At least one gift has been unwrapped (game has started)

**Note**: Remaining wrapped gifts are assigned in `endGame()` to players without gifts.

### Rule 9: Wrapped Gift Claiming (Unwrap Before Final Turn)
**CRITICAL**: All wrapped gifts **MUST** be unwrapped before Player 1's final turn.

**Before Player 1's Final Turn** (`currentTurnIndex < turnQueue.length - 1`):
- **Priority**: Players should prioritize picking wrapped gifts to ensure all gifts are unwrapped
- **Flexibility**: Players **CAN** still steal if they prefer, but picking wrapped gifts is strongly encouraged
- **Rationale**: While we want all gifts unwrapped, players should have the freedom to choose their strategy. The system will encourage picking but not force it.
- **Exception**: If a player has no gift and no wrapped gifts are available, they may steal (victim deadlock prevention)

**On Player 1's Final Turn** (`currentTurnIndex === turnQueue.length - 1`):
- Player 1 **CAN** steal even if wrapped gifts remain (bookend exception - Rule 1)
- This is the only turn in Standard Phase where stealing is explicitly allowed when wrapped gifts exist

**Implementation**: The system encourages picking wrapped gifts through UI/UX, but does not block stealing. Bots will prioritize picking wrapped gifts when they have no gift.

### Rule 10: Turn Skipping
- Players **CAN** skip their turn if they are content with their current gift
- Skipping ends their turn and advances to next player
- **Standard Mode**: 
  - Players **CAN** skip if they have a gift (they want to keep it)
  - Players **CANNOT** skip if they have no gift (they must pick a wrapped gift)
  - **Exception**: Victims with no gift and no legal moves can skip (deadlock prevention)
- **Boomerang Mode**: Allowed for anyone with a gift
- **Victim Deadlock Prevention**: If a victim receives a gift via swap and has no legal moves (no wrapped gifts available, all other gifts frozen or U-Turn protected), they **MUST** be allowed to skip to prevent deadlock

## State Transitions

### PICK Action
```
Pre-conditions:
- currentPlayerId === playerId
- turnAction[playerId] === null (hasn't acted this turn)
- wrappedGifts.includes(giftId)
- (Standard phase) player does not have a gift OR wrapped gifts remain

State Changes:
- giftId removed from wrappedGifts
- unwrappedGifts[giftId] = { ownerId: playerId, stealCount: 0, isFrozen: false, lastOwnerId: null }
- turnAction[playerId] = 'PICKED'
- currentTurnIndex = nextValidPlayerIndex
- currentPlayerId = nextValidPlayer
- history.push({ type: 'PICK', playerId, giftId, timestamp })

Post-conditions:
- Player owns exactly one gift
- Gift is unwrapped
```

### STEAL Action
```
Pre-conditions:
- currentPlayerId === playerId
- turnAction[playerId] === null (hasn't acted this turn)
- unwrappedGifts.has(giftId)
- gift.isFrozen === false
- gift.ownerId !== playerId
- gift.lastOwnerId !== playerId (U-Turn prevention)
- (Standard phase) player does not have a gift OR (Boomerang phase) player can swap

State Changes:
- stolenGift.stealCount += 1
- stolenGift.isFrozen = (stealCount >= maxSteals)
- stolenGift.ownerId = playerId
- stolenGift.lastOwnerId = previousOwnerId
- If player had a gift (SWAP):
  - playerGift.ownerId = previousOwnerId
  - playerGift.stealCount = playerGift.stealCount  // CRITICAL: DO NOT RESET - retains heat level
  - playerGift.isFrozen = playerGift.isFrozen  // CRITICAL: DO NOT RESET - retains frozen state
  - playerGift.lastOwnerId = playerId
- turnAction[playerId] = 'STOLEN'
- currentPlayerId = previousOwnerId (victim becomes active)
- currentTurnIndex = UNCHANGED (turn order paused)
- history.push({ type: 'STEAL', playerId, giftId, previousOwnerId, exchangedGiftId, stealCount, isFrozen, timestamp })

Post-conditions:
- Stealer owns exactly one gift (the stolen gift)
- Victim owns exactly one gift (if exchange occurred) OR has no gift (if stealer had no gift)
- No player owns multiple gifts
```

### END_TURN Action (Skip)
```
Pre-conditions:
- currentPlayerId === playerId
- (Standard Mode): 
  - Player has a gift (they want to keep it) - allowed
  - Player has no gift - NOT allowed (must pick a wrapped gift)
  - Exception: Victims with no gift and no legal moves can skip (deadlock prevention)
- (Boomerang Mode): Allowed for anyone with a gift

State Changes:
- turnAction[playerId] = null
- currentTurnIndex = nextValidPlayerIndex
- currentPlayerId = nextValidPlayer
- history.push({ type: 'END_TURN', playerId, timestamp }) (if tracked)

Post-conditions:
- Turn advances to next valid player
```

## Validation Rules

### Rule A: Double Dip Check
- **Violation**: Player takes a turn but already holds a gift (in standard phase)
- **Exception 1**: Steal chain victim (currentVictim)
- **Exception 2**: Boomerang phase
- **Exception 3**: Final Turn of Standard Mode (Player 1's second turn)
- **Exception 4**: Wrapped gifts remain (to claim all gifts)

### Rule B: Ghost Steal Check
- **Violation**: Player tries to steal a gift from someone who doesn't own it
- **Check**: `giftStatus[giftId].owner === previousOwnerId` must be true

### Rule C: Locked Gift Check
- **Violation**: Attempted to steal a frozen gift
- **Check**: `gift.isFrozen === false` before steal

### Rule D: U-Turn Check
- **Violation**: Immediate steal-back detected
- **Check**: `gift.lastOwnerId !== playerId` before steal

### Rule E: Single Ownership Check
- **Violation**: Player owns multiple gifts after any action
- **Check**: After PICK/STEAL, count gifts per player must be <= 1

### Rule F: All Gifts Claimed Check
- **Requirement**: At game end, all gifts must be assigned to players
- **Check**: `unwrappedGifts.length + remainingWrappedGifts.length === totalParticipants`
- **Note**: Remaining wrapped gifts are assigned in `endGame()`

## Data Structures

### Game State
```javascript
{
  partyId: string,
  currentTurnIndex: number,        // Index into turnQueue (0-based)
  currentPlayerId: string,         // Active player ID
  turnOrder: string[],              // Original shuffled order
  turnQueue: string[],              // Complete queue array
  wrappedGifts: string[],           // Array of gift IDs still wrapped
  unwrappedGifts: Map<string, {    // Map of giftId -> gift data
    ownerId: string | null,
    stealCount: number,
    isFrozen: boolean,
    lastOwnerId: string | null
  }>,
  turnAction: Map<string, string>, // Map of playerId -> action ('PICKED' | 'STOLEN' | null)
  phase: 'LOBBY' | 'ACTIVE' | 'ENDED',
  isBoomerangPhase: boolean,
  config: {
    maxSteals: number,              // Default: 3
    returnToStart: boolean           // Boomerang mode flag
  },
  history: Array<{                  // Complete game history
    type: 'PICK' | 'STEAL',
    playerId: string,
    giftId: string,
    previousOwnerId?: string,       // For STEAL
    exchangedGiftId?: string,        // For STEAL (if stealer had a gift)
    stealCount?: number,             // For STEAL
    isFrozen?: boolean,              // For STEAL
    timestamp: string
  }>
}
```

## Edge Cases

1. **All gifts frozen but wrapped gifts remain**: Game ends, remaining wrapped gifts assigned in `endGame()`
2. **Player with gift picks wrapped gift**: Allowed if wrapped gifts remain (to claim all gifts)
3. **Victim has no gift after steal**: Victim becomes active and must pick a new gift
4. **Victim has gift after exchange**: Victim can skip turn or steal from someone else
5. **Last player in queue has gift**: Game checks if it should end (all conditions met)
6. **Boomerang phase with all gifts frozen**: Game ends immediately
7. **Player 1 Final Turn in Standard Mode**: Player 1 already has a gift from Turn 1, but must be allowed to act on their final turn (exception to Rule 1)
8. **Unlucky Victim Deadlock**: If a victim receives a gift via swap and has no legal moves (no wrapped gifts, all other gifts frozen or U-Turn protected), they must be allowed to skip to prevent deadlock
9. **Swap Reset Exploit Prevention**: When a gift is swapped, its `stealCount` and `isFrozen` state are retained (not reset) to prevent players from washing gifts of their heat level
10. **Wrapped Gifts Before Player 1 Final Turn**: If wrapped gifts remain before Player 1's final turn (`currentTurnIndex < turnQueue.length - 1`), players **MUST** pick wrapped gifts instead of stealing. Stealing is disabled to force unwrapping. Only Player 1 on their final turn can steal when wrapped gifts remain (Rule 9)

## Notes

- The game uses `currentTurnIndex` to track position in `turnQueue` (0 to length-1)
- `isBoomerangPhase` is true when `currentTurnIndex >= turnOrder.length`
- Steal chains pause the turn order until the victim acts
- All validation happens server-side; client-side checks are for UX only
- Game history is immutable and used for validation and replay


