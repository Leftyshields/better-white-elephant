# Environment Variables Setup Guide

This guide walks you through configuring all environment variables needed for the Better White Elephant platform.

## Overview

You need to create `.env` files in three locations:
1. **Server**: `server/.env` - Firebase Admin SDK, Redis, server config
2. **Client**: `client/.env` - Firebase Web App config, server URL
3. **Functions**: `functions/.env` - Resend API key, client URL

---

## Step 1: Firebase Project Setup

### 1.1 Create/Select Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select existing project
3. Note your **Project ID** (you'll need this)

### 1.2 Get Firebase Web App Config (for Client)

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll to **Your apps** section
3. Click the **Web** icon (`</>`) to add a web app (if not already added)
4. Register app with a nickname (e.g., "Better White Elephant")
5. Copy the **Firebase configuration object** - you'll see:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef123456"
   };
   ```

### 1.3 Enable Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password** (for email link authentication)
3. Enable **Google** sign-in provider
4. For Email Link: Enable "Email link (passwordless sign-in)"

### 1.4 Get Firebase Admin SDK Credentials (for Server)

1. In Firebase Console, go to **Project Settings** > **Service accounts**
2. Click **Generate new private key**
3. Download the JSON file (keep it secure!)
4. Open the JSON file - you'll need:
   - `project_id`
   - `private_key` (the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
   - `client_email`

---

## Step 2: Redis Setup

### Option A: Local Redis (Development)

1. Install Redis locally:
   ```bash
   # macOS
   brew install redis
   brew services start redis
   
   # Linux
   sudo apt-get install redis-server
   sudo systemctl start redis
   ```

2. Use: `redis://localhost:6379`

### Option B: Cloud Redis (Production)

**Upstash (Recommended - Free tier available):**
1. Go to [Upstash](https://upstash.com/)
2. Create account and new Redis database
3. Copy the **REST URL** - format: `redis://default:password@host:port`

**Redis Cloud:**
1. Go to [Redis Cloud](https://redis.com/try-free/)
2. Create account and database
3. Copy connection string

---

## Step 3: Resend API Setup (for Email Invites)

1. Go to [Resend](https://resend.com/)
2. Sign up for free account
3. Go to **API Keys** section
4. Click **Create API Key**
5. Name it (e.g., "White Elephant")
6. Copy the API key (starts with `re_`)

**Note**: You'll also need to verify a domain in Resend for production, but the free tier allows sending from `onboarding@resend.dev` for testing.

---

## Step 4: Create .env Files

### 4.1 Server .env File

Create `server/.env`:

```bash
cd server
cp .env.example .env
```

Then edit `server/.env` with your values:

```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-actual-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour actual private key here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Redis
REDIS_URL=redis://localhost:6379

# Server Config
SERVER_PORT=3001
CLIENT_URL=http://localhost:5173
```

**Important**: 
- The `FIREBASE_PRIVATE_KEY` must be in quotes and include `\n` for newlines
- Copy the entire private key from the JSON file, including the BEGIN/END markers

### 4.2 Client .env File

Create `client/.env`:

```bash
cd client
cp .env.example .env
```

Then edit `client/.env` with your Firebase Web App config:

```env
VITE_FIREBASE_API_KEY=AIzaSyC...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

VITE_SERVER_URL=http://localhost:3001
```

### 4.3 Functions .env File

Create `functions/.env`:

```bash
cd functions
cp .env.example .env
```

Then edit `functions/.env`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
CLIENT_URL=http://localhost:5173
```

**Note**: For production deployment, Firebase Functions uses `firebase functions:config:set` instead of .env files. But for local development, .env works.

---

## Step 5: Verify Setup

### Quick Check:

1. **Server variables**: Check `server/.env` has all Firebase Admin SDK values
2. **Client variables**: Check `client/.env` has all Firebase Web App values (all start with `VITE_`)
3. **Functions variables**: Check `functions/.env` has Resend API key

### Test Firebase Connection:

```bash
# In server directory
cd server
node -e "require('dotenv').config(); console.log('Project ID:', process.env.FIREBASE_PROJECT_ID)"
```

### Test Redis Connection:

```bash
# Make sure Redis is running
redis-cli ping
# Should return: PONG
```

---

## Security Notes

⚠️ **IMPORTANT**:
- Never commit `.env` files to git (they're in `.gitignore`)
- Keep Firebase Admin SDK private key secure
- Don't share API keys publicly
- For production, use environment variable management (Firebase Functions config, cloud provider secrets, etc.)

---

## Troubleshooting

### "Firebase Admin initialization error"
- Check that `FIREBASE_PRIVATE_KEY` includes the full key with `\n` newlines
- Verify the key is wrapped in quotes
- Ensure `FIREBASE_CLIENT_EMAIL` matches the service account email

### "Redis connection failed"
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` format is correct
- For cloud Redis, check the connection string includes password

### "Firebase Auth not working"
- Verify all `VITE_FIREBASE_*` variables are set in `client/.env`
- Check that Email Link and Google sign-in are enabled in Firebase Console
- Ensure you're using the Web App config (not Admin SDK config)

---

## Next Steps

After setting up environment variables:
1. Initialize Firestore: `firebase init firestore`
2. Deploy security rules: `firebase deploy --only firestore:rules`
3. Start development servers (see README.md)

