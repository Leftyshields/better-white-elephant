# Analytics Tracking Guide

This document outlines the analytics events being tracked in the Better White Elephant application.

## Conversion Funnel Metrics

### 1. Game Start → Game Complete
- **Event**: `start_game` → `game_complete`
- **Conversion Rate**: `game_complete` / `start_game`
- **Location**: Tracked in `useGameEngine.js` when game ends

### 2. Party Creation → Game Start
- **Event**: `create_party` → `start_game`
- **Conversion Rate**: `start_game` / `create_party`
- **Location**: Tracked in `PartyLobby.jsx`

### 3. Invite Sent → Participant Join
- **Event**: `invite_sent` → `participant_join`
- **Conversion Rate**: `participant_join` / `invite_sent`
- **Location**: Tracked in `PartyLobby.jsx` and `Party.jsx`

## Key Metrics Tracked

### Game Completion
- **Event**: `game_complete`
- **Parameters**:
  - `party_id`: Party identifier
  - `duration_seconds`: Total game duration
  - `total_actions`: Number of actions in the game
  - `steal_count`: Total number of steals
  - `boomerang_mode`: Whether boomerang mode was enabled
- **Location**: `useGameEngine.js` - `game-ended` socket event

### Player Counts
- **Event**: `start_game`
- **Parameters**:
  - `party_id`: Party identifier
  - `participant_count`: Number of participants when game starts
- **Location**: `PartyLobby.jsx` - `handleStartGame`

### Game Abandonment
- **Event**: `game_abandoned`
- **Parameters**:
  - `party_id`: Party identifier
  - `phase`: Phase where abandoned (lobby, setup, in_progress)
  - `participant_count`: Number of participants when abandoned
- **Location**: `Home.jsx` - `handleDeleteParty`

### Errors
- **Event**: `error`
- **Parameters**:
  - `error_type`: Type of error (socket_error, start_game_failed, etc.)
  - `error_message`: Error message
  - `location`: Component/function where error occurred
- **Locations**: 
  - `useGameEngine.js` - Socket errors
  - `PartyLobby.jsx` - Game start errors, invite errors
  - `Party.jsx` - Auto-join errors
  - `Home.jsx` - Delete party errors

### Invite Tracking
- **Event**: `invite_sent`
- **Parameters**:
  - `party_id`: Party identifier
  - `method`: Invite method (email, share_link)
  - `success`: Whether invite was successfully sent
- **Location**: `PartyLobby.jsx` - `handleSendInvite`

### Participant Join
- **Event**: `participant_join`
- **Parameters**:
  - `party_id`: Party identifier
  - `invite_method`: How they joined (email, share_link, direct)
- **Location**: `Party.jsx` - Auto-join logic

## Google Analytics Queries

### Conversion Rate: Start to Finish
```
Events: start_game (numerator) → game_complete (denominator)
Formula: (game_complete events) / (start_game events) * 100
```

### Average Players Per Game
```
Event: start_game
Parameter: participant_count
Aggregation: Average
```

### Error Rate
```
Event: error
Group by: error_type
Count: Total errors
```

### Abandonment Rate by Phase
```
Event: game_abandoned
Group by: phase
Count: Total abandonments
```

### Invite Success Rate
```
Event: invite_sent
Filter: method = 'email'
Formula: (success = true) / (total invites) * 100
```

## Implementation Status

✅ **Implemented**:
- Game completion tracking with metrics
- Player count tracking on game start
- Error tracking throughout app
- Invite success/failure tracking
- Participant join tracking
- Game abandonment tracking

📊 **Analytics Dashboard Setup**:
1. Go to Google Analytics → Events
2. Create custom reports for:
   - Conversion Funnel (create_party → start_game → game_complete)
   - Error Tracking (group by error_type)
   - Player Count Distribution
   - Abandonment by Phase

## Next Steps

1. **Set up Google Analytics Custom Reports**:
   - Create conversion funnel visualization
   - Set up error tracking dashboard
   - Create player count distribution chart

2. **Set up Alerts**:
   - Alert when error rate exceeds threshold
   - Alert when conversion rate drops below threshold
   - Alert when abandonment rate increases

3. **Additional Metrics to Consider**:
   - Average game duration
   - Average steals per game
   - Boomerang mode usage rate
   - Gift scraping success rate
   - Fulfillment completion rate

