# Better White Elephant 🎁

A real-time White Elephant gift exchange platform built with React, Firebase, Node.js, Socket.io, and Redis.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org)

## Architecture

- **Frontend**: React (Vite) + Tailwind CSS
- **Auth**: Firebase Authentication (Email Link + Google Sign-In)
- **Database**: Cloud Firestore (persistence)
- **Game Engine**: Node.js + Socket.io (real-time)
- **State Cache**: Redis (transient game state)
- **Email**: Resend API (via Firebase Functions)

## Project Structure

```
better-white-elephant/
├── client/          # React frontend
├── server/          # Node.js game server
├── functions/       # Firebase Functions (email)
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
   - Add Resend API key

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

- Players take turns picking wrapped gifts or stealing unwrapped gifts
- Gifts become "frozen" after being stolen a maximum number of times
- When a gift is stolen, the previous owner goes next (steal stack)
- Optional "boomerang" rule: after the last player, everyone gets another turn in reverse order

## Deployment

### Firebase Hosting (Frontend)

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

See [DEPLOY_FIREBASE_HOSTING.md](./DEPLOY_FIREBASE_HOSTING.md) for detailed instructions.

### Other Services

- **Server**: Deploy to cloud service (Railway, Render, etc.)
- **Functions**: Deploy via Firebase CLI: `firebase deploy --only functions`
- **Redis**: Use cloud Redis service (Upstash, Redis Cloud)
- **Firestore Rules**: Deploy via Firebase CLI: `firebase deploy --only firestore:rules`


