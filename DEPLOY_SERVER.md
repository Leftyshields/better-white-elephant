# Deploy Node.js Game Server

The game server needs to be deployed separately from the frontend. Here are options:

## What is the Server?

The Node.js server (`server/` directory) handles:
- Real-time game logic via Socket.io
- Game state management (stored in Redis)
- API endpoints for starting games, scraping gift URLs, etc.

## Deployment Options

### Option 1: Railway (Recommended - Easy)

1. **Sign up:** https://railway.app
2. **Create new project**
3. **Add service** → **GitHub Repo** → Select your repository
4. **Configure:**
   - Root directory: `server`
   - Build command: (none needed, just `npm install`)
   - Start command: `npm start`
5. **Add environment variables:**
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_CLIENT_EMAIL`
   - `REDIS_URL` (Railway can provision Redis for you)
   - `CLIENT_URL` (your Firebase Hosting URL)
   - `SERVER_PORT` (optional, defaults to 3001)
6. **Deploy!** Railway will give you a URL like: `https://your-app.railway.app`
7. **Update GitHub secret:** Set `VITE_SERVER_URL` to your Railway URL

### Option 2: Render

1. **Sign up:** https://render.com
2. **New** → **Web Service**
3. **Connect GitHub** → Select your repo
4. **Configure:**
   - Name: `better-white-elephant-server`
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `Node`
5. **Add environment variables** (same as Railway)
6. **Deploy!** Get URL like: `https://your-app.onrender.com`
7. **Update GitHub secret:** Set `VITE_SERVER_URL` to your Render URL

### Option 3: Fly.io

1. **Sign up:** https://fly.io
2. **Install flyctl:** `curl -L https://fly.io/install.sh | sh`
3. **Create app:** `fly launch` (in `server/` directory)
4. **Add secrets:** `fly secrets set KEY=value`
5. **Deploy:** `fly deploy`
6. **Get URL:** `https://your-app.fly.dev`

## Required Environment Variables

All deployment options need these:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
REDIS_URL=redis://default:password@host:port
CLIENT_URL=https://your-project.web.app
SERVER_PORT=3001
```

## Redis Setup

You'll need a Redis instance:

- **Railway:** Can provision Redis automatically
- **Render:** Use Redis addon
- **Upstash:** https://upstash.com (free tier available)
- **Redis Cloud:** https://redis.com/cloud (free tier available)

## After Deployment

1. **Get your server URL** (e.g., `https://your-app.railway.app`)
2. **Update GitHub secret:**
   - Go to Settings → Secrets → Actions
   - Edit `VITE_SERVER_URL`
   - Set it to your deployed server URL
3. **Rebuild frontend** (or wait for next deployment)

## Testing

Test your deployed server:
```bash
curl https://your-server-url.com/api/game/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## For Now (Development)

If you haven't deployed the server yet:
- Use `http://localhost:3001` as `VITE_SERVER_URL` in GitHub secrets
- The frontend will build successfully
- Game features won't work until the server is deployed
- You can deploy the frontend now and add the server URL later

