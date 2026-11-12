# StealOrReveal

A live White Elephant gift exchange for remote teams, built with React, Firebase, Node.js, Socket.io, and Redis. This repository is `better-white-elephant`.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/leftyshields/better-white-elephant/workflows/CI/badge.svg)](https://github.com/leftyshields/better-white-elephant/actions)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org)

## Architecture

- **Frontend**: React (Vite) + Tailwind CSS, hosted on **Firebase Hosting**
- **Auth**: Firebase Authentication (Email Link + Google Sign-In)
- **Database**: Cloud Firestore (persistence)
- **Game Engine**: Node.js + Socket.io on **Google Cloud Run** (`stealorreveal-game-server`, `us-central1`)
- **State Cache**: Upstash Redis (transient game state)
- **Email**: Resend API (via Firebase Functions)

## Documentation

| Topic | Link |
|-------|------|
| All docs (index) | [docs/README.md](./docs/README.md) |
| Game rules | [docs/GAME_RULES.md](./docs/GAME_RULES.md) |
| Architecture spec | [docs/ARCHITECTURE_SPEC.md](./docs/ARCHITECTURE_SPEC.md) |
| Testing | [docs/TESTING.md](./docs/TESTING.md) |
| Deploy game server | [docs/deploy/DEPLOY_GAME_SERVER.md](./docs/deploy/DEPLOY_GAME_SERVER.md) |
| Deploy Functions / email | [docs/deploy/DEPLOY_FUNCTIONS.md](./docs/deploy/DEPLOY_FUNCTIONS.md), [docs/deploy/DEPLOY_EMAIL_SERVICE.md](./docs/deploy/DEPLOY_EMAIL_SERVICE.md) |
| Analytics | [docs/analytics/ANALYTICS_TRACKING.md](./docs/analytics/ANALYTICS_TRACKING.md) |
| Contributing | [docs/community/CONTRIBUTING.md](./docs/community/CONTRIBUTING.md) |

## Project Structure

```
better-white-elephant/
├── client/          # React frontend
├── server/          # Node.js game server
├── functions/       # Firebase Functions (email)
├── docs/            # Project documentation
└── firebase.json    # Firebase configuration
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   cd client && npm install
   cd ../server && npm install
   cd ../functions && npm install
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env` in root and server directories
   - Add your Firebase credentials
   - Add Redis connection string
   - **Server CORS**: Set `ALLOWED_ORIGINS` (comma-separated) or `CLIENT_URL` for allowed origins
     - Example: `ALLOWED_ORIGINS=https://stealorreveal.com,https://www.stealorreveal.com`
     - Defaults to localhost for development, production domains for production
   - **Apify API (Optional)**: Set `APIFY_API_TOKEN` in server `.env` for enhanced Amazon product scraping
     - Get your token from [Apify Console](https://console.apify.com/account/integrations)
     - The scraper will automatically use Apify for Amazon URLs if the token is set
     - Falls back to cheerio scraping if token is not set or Apify fails
   - **Bot Refresh Simulation (Optional)**: Set `BOT_REFRESH_SIMULATION=true` in server `.env` to enable periodic bot refresh simulation
     - Simulates realistic browser refresh behavior for bots (disconnect/reconnect scenarios)
     - Helps test state version checking and prevent stale state resets
     - Bots will randomly refresh every 30-120 seconds with 30% probability
     - Useful for testing the game state persistence and version checking fixes
   - For Functions: Set up Resend API key (see [docs/deploy/DEPLOY_FUNCTIONS.md](./docs/deploy/DEPLOY_FUNCTIONS.md))

3. **Firebase setup:**
   - Initialize Firebase project: `firebase init`
   - Enable Authentication (Email Link + Google)
   - Set up Firestore database
   - Deploy security rules: `firebase deploy --only firestore:rules`

4. **Run development servers:**
   ```bash
   # Terminal 1: Client
   npm run dev:client

   # Terminal 2: Server
   npm run dev:server

   # Terminal 3: Redis (if local)
   redis-server
   ```

## Game Rules

Canonical rules live in [docs/GAME_RULES.md](./docs/GAME_RULES.md). Summary:

- Players take turns picking wrapped gifts or stealing unwrapped gifts
- Gifts become "frozen" after being stolen a maximum number of times
- When a gift is stolen, the previous owner goes next (steal stack)
- Optional "boomerang" rule: after the last player, everyone gets another turn in reverse order

## Deployment

### Firebase Hosting (frontend)

1. **Build the client:**
   ```bash
   cd client
   npm run build
   cd ..
   ```

2. **Deploy to Firebase:**
   ```bash
   firebase deploy --only hosting
   ```

Production hosting also runs via GitHub Actions. See [.github/workflows/README.md](./.github/workflows/README.md) (Deploy to Firebase Hosting).

### Other services

- **Game server (Cloud Run):** [docs/deploy/DEPLOY_GAME_SERVER.md](./docs/deploy/DEPLOY_GAME_SERVER.md) (manual `workflow_dispatch` only)
- **Functions:** `firebase deploy --only functions` or [docs/deploy/DEPLOY_FUNCTIONS.md](./docs/deploy/DEPLOY_FUNCTIONS.md)
- **Redis (production):** Upstash URL in Secret Manager (`game-server-redis-url`); see deploy guide
- **Firestore rules:** `firebase deploy --only firestore:rules`

