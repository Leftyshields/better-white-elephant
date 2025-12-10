# Google Analytics Events Documentation

Complete list of all analytics events tracked in Better White Elephant for dashboard creation.

## Event Categories

### 1. User Authentication Events

#### `sign_up`
**Description**: User creates a new account  
**Parameters**:
- `method` (string): Sign up method (`email`, `google`)

**Location**: `client/src/pages/Home.jsx`  
**When**: User successfully signs up

---

#### `login`
**Description**: User logs into their account  
**Parameters**:
- `method` (string): Login method (`email`, `google`)

**Location**: `client/src/pages/Home.jsx`  
**When**: User successfully logs in

---

### 2. Party Management Events

#### `create_party`
**Description**: User creates a new party/game  
**Parameters**:
- `has_title` (boolean): Whether party has a title
- `has_date` (boolean): Whether party has a date set

**Location**: `client/src/pages/Home.jsx`  
**When**: Party is successfully created

---

#### `join_party`
**Description**: User joins an existing party  
**Parameters**:
- `party_id` (string): Party identifier

**Location**: Currently defined but not actively used  
**When**: User joins a party (via invite or direct link)

---

#### `participant_join`
**Description**: Participant joins a party  
**Parameters**:
- `party_id` (string): Party identifier
- `invite_method` (string): How they joined (`email`, `share_link`, `direct`)

**Location**: `client/src/pages/Party.jsx`  
**When**: User auto-joins party via link or invite

---

### 3. Invite & Sharing Events

#### `invite_sent`
**Description**: Host sends an invite to a participant  
**Parameters**:
- `party_id` (string): Party identifier
- `method` (string): Invite method (`email`, `share_link`)
- `success` (boolean): Whether invite was successfully sent

**Location**: `client/src/components/PartyLobby.jsx`  
**When**: Invite is sent (success or failure tracked)

---

#### `share`
**Description**: User shares party link  
**Parameters**:
- `party_id` (string): Party identifier
- `method` (string): Share method (`copy_link`, `email`, `social`)

**Location**: Currently defined but not actively used  
**When**: User shares party link

---

### 4. Gift Management Events

#### `submit_gift`
**Description**: User submits a gift link  
**Parameters**:
- `party_id` (string): Party identifier

**Location**: `client/src/components/PartyLobby.jsx`  
**When**: Gift link is successfully submitted

---

#### `gift_scrape`
**Description**: Gift link scraping attempt  
**Parameters**:
- `party_id` (string): Party identifier
- `success` (boolean): Whether scraping was successful
- `error` (string, optional): Error message if failed

**Location**: Currently defined but not actively used  
**When**: Gift URL is scraped for metadata

---

### 5. Game Flow Events

#### `start_game`
**Description**: Game starts  
**Parameters**:
- `party_id` (string): Party identifier
- `participant_count` (number): Number of participants when game starts

**Location**: `client/src/components/PartyLobby.jsx`  
**When**: Host clicks "Start Game" and game begins

**Key Metric**: Use this to calculate conversion rate (start_game / create_party)

---

#### `game_action`
**Description**: Player performs an action during the game  
**Parameters**:
- `action` (string): Action type (`reveal`, `steal`, `end_turn`)
- `party_id` (string): Party identifier

**Location**: 
- `client/src/hooks/useGameEngine.js`
- `client/src/hooks/useGameSocket.js`

**When**: Player picks a gift, steals a gift, or ends their turn

---

#### `game_complete`
**Description**: Game ends successfully  
**Parameters**:
- `party_id` (string): Party identifier
- `duration_seconds` (number): Total game duration in seconds
- `total_actions` (number): Total number of actions in the game
- `steal_count` (number): Total number of steals
- `boomerang_mode` (boolean): Whether boomerang mode was enabled

**Location**: `client/src/hooks/useGameEngine.js`  
**When**: Game ends (via `game-ended` socket event)

**Key Metric**: Use this to calculate completion rate (game_complete / start_game)

---

#### `game_complete_participants`
**Description**: Additional event tracking participant count at game completion  
**Parameters**:
- `party_id` (string): Party identifier
- `participant_count` (number): Number of participants when game completed

**Location**: `client/src/hooks/useGameEngine.js`  
**When**: Game ends (fires alongside `game_complete`)

---

#### `game_abandoned`
**Description**: Game/party is abandoned before completion  
**Parameters**:
- `party_id` (string): Party identifier
- `phase` (string): Phase where abandoned (`lobby`, `setup`, `in_progress`)
- `participant_count` (number): Number of participants when abandoned

**Location**: `client/src/pages/Home.jsx`  
**When**: Host deletes a party that hasn't ended

**Key Metric**: Use this to calculate abandonment rate by phase

---

### 6. Error Events

#### `error`
**Description**: Error occurs in the application  
**Parameters**:
- `error_type` (string): Type of error
  - `socket_error`: Socket connection error
  - `start_game_failed`: Failed to start game
  - `invite_send_failed`: Failed to send invite
  - `invite_send_exception`: Exception while sending invite
  - `auto_join_failed`: Failed to auto-join party
  - `delete_party_failed`: Failed to delete party
- `error_message` (string): Error message
- `location` (string): Component/function where error occurred
  - `useGameEngine`: Game engine hook
  - `PartyLobby`: Party lobby component
  - `Party`: Party page component
  - `Home`: Home page component

**Location**: Multiple locations throughout the app  
**When**: Any error occurs

**Key Metric**: Track error rate by type and location

---

### 7. Feature Usage Events

#### `feature_usage`
**Description**: User uses a specific feature  
**Parameters**:
- `feature_name` (string): Name of the feature
- Additional feature-specific parameters

**Location**: Currently defined but not actively used  
**When**: User interacts with specific features

---

#### `reaction`
**Description**: User sends a reaction/emoji  
**Parameters**:
- `party_id` (string): Party identifier
- `reaction_type` (string): Type of reaction (`emoji`, etc.)
- `gift_id` (string): Gift ID that was reacted to

**Location**: Currently defined but not actively used  
**When**: User sends a reaction during the game

---

### 8. Fulfillment Events

#### `fulfillment`
**Description**: Fulfillment-related action  
**Parameters**:
- `party_id` (string): Party identifier
- `action` (string): Action type (`address_added`, `fulfillment_confirmed`)

**Location**: Currently defined but not actively used  
**When**: User adds shipping address or confirms fulfillment

---

### 9. UI Interaction Events

#### `button_click`
**Description**: User clicks a button  
**Parameters**:
- `button_name` (string): Name of the button
- `location` (string): Location where button was clicked

**Location**: `client/src/pages/Home.jsx`  
**When**: User clicks specific tracked buttons

---

#### `session_duration`
**Description**: Session duration on a page  
**Parameters**:
- `page` (string): Page name
- `duration_seconds` (number): Duration in seconds

**Location**: Currently defined but not actively used  
**When**: User leaves a page (would need implementation)

---

#### `milestone`
**Description**: User reaches a milestone  
**Parameters**:
- `milestone` (string): Milestone name (`first_party`, `first_game`, `10th_party`, etc.)

**Location**: Currently defined but not actively used  
**When**: User reaches a milestone

---

### 10. Page View Events

#### `page_view`
**Description**: User views a page  
**Parameters**:
- `page_title` (string): Title of the page
- `page_location` (string): Path of the page

**Location**: `client/src/utils/analytics.js`  
**When**: User navigates to a new page (automatic via router)

---

## Key Metrics to Calculate

### Conversion Funnel
1. **Sign Up → Create Party**: `create_party` / `sign_up`
2. **Create Party → Start Game**: `start_game` / `create_party`
3. **Start Game → Complete Game**: `game_complete` / `start_game`
4. **Overall Funnel**: `sign_up` → `create_party` → `start_game` → `game_complete`

### Engagement Metrics
- **Average Players Per Game**: Average of `participant_count` from `start_game` events
- **Average Game Duration**: Average of `duration_seconds` from `game_complete` events
- **Average Actions Per Game**: Average of `total_actions` from `game_complete` events
- **Average Steals Per Game**: Average of `steal_count` from `game_complete` events
- **Boomerang Mode Usage**: Count of `game_complete` where `boomerang_mode = true` / Total `game_complete`

### Error Metrics
- **Error Rate**: Total `error` events / Total page views
- **Error Rate by Type**: Count of `error` events grouped by `error_type`
- **Error Rate by Location**: Count of `error` events grouped by `location`

### Abandonment Metrics
- **Abandonment Rate**: `game_abandoned` / (`start_game` + `game_abandoned`)
- **Abandonment by Phase**: Count of `game_abandoned` grouped by `phase`

### Invite Metrics
- **Invite Success Rate**: `invite_sent` where `success = true` / Total `invite_sent`
- **Join Rate**: `participant_join` / `invite_sent` where `success = true`

## Dashboard Recommendations

### 1. Conversion Funnel Dashboard
- Funnel visualization: `sign_up` → `create_party` → `start_game` → `game_complete`
- Conversion rates at each stage
- Drop-off analysis

### 2. Game Performance Dashboard
- Average players per game
- Average game duration
- Average actions per game
- Average steals per game
- Boomerang mode usage rate
- Completion rate (`game_complete` / `start_game`)

### 3. Error Monitoring Dashboard
- Error rate over time
- Top error types
- Error rate by location (component)
- Error trends

### 4. Engagement Dashboard
- Total games started
- Total games completed
- Abandonment rate by phase
- Invite success rate
- Participant join rate

### 5. User Journey Dashboard
- Sign up → First party creation time
- Party creation → Game start time
- Game start → Game completion time
- Average time between milestones

## Event Parameter Reference

### Common Parameters
- `party_id` (string): Unique party identifier
- `participant_count` (number): Number of participants
- `method` (string): Method used (varies by event)
- `success` (boolean): Whether action succeeded
- `error_type` (string): Type of error
- `error_message` (string): Error message
- `location` (string): Component/function location

### Game-Specific Parameters
- `duration_seconds` (number): Duration in seconds
- `total_actions` (number): Total number of actions
- `steal_count` (number): Total number of steals
- `boomerang_mode` (boolean): Whether boomerang mode enabled
- `action` (string): Action type (`reveal`, `steal`, `end_turn`)
- `phase` (string): Game phase (`lobby`, `setup`, `in_progress`)

## Implementation Notes

- All events are sent to both Firebase Analytics and Google Analytics
- Events use the `trackEvent()` function which handles both platforms
- Some events are defined but not yet implemented (marked as "Currently defined but not actively used")
- Error tracking is comprehensive and covers all major error scenarios
- Conversion funnel tracking is fully implemented for the main user journey

## Next Steps for Dashboard Creation

1. **Set up Custom Dimensions** in Google Analytics:
   - `party_id` (for cohort analysis)
   - `error_type` (for error grouping)
   - `location` (for component-level analysis)

2. **Create Custom Reports**:
   - Conversion funnel report
   - Error monitoring report
   - Game performance report

3. **Set up Alerts**:
   - Alert when error rate exceeds threshold
   - Alert when conversion rate drops
   - Alert when abandonment rate increases

4. **Create Segments**:
   - Users who completed games
   - Users who abandoned games
   - Users who used boomerang mode

