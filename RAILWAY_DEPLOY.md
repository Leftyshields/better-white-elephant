# Deploy Server to Railway - Step by Step

This guide will walk you through deploying your Node.js game server to Railway.

## Prerequisites

1. Railway account (free tier available)
2. GitHub repository connected
3. Firebase service account key
4. Redis instance (Railway can provision this)

---

## Step 1: Sign Up for Railway

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Sign up with GitHub (recommended - easier integration)

---

## Step 2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository: `Leftyshields/better-white-elephant`
4. Railway will detect it's a Node.js project

---

## Step 3: Configure the Service

1. **Set Root Directory:**
   - Click on your service
   - Go to **Settings** → **Root Directory**
   - Set to: `server`
   - Click **Save**

2. **Set Start Command:**
   - Go to **Settings** → **Deploy**
   - Start Command: `npm start`
   - Railway will auto-detect this, but verify it's set

---

## Step 4: Add Redis Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add Redis"**
3. Railway will provision a Redis instance
4. **Copy the Redis URL** - you'll need this in the next step
   - Format: `redis://default:password@host:port`

---

## Step 5: Add Environment Variables

Go to your service → **Variables** tab and add:

### Firebase Configuration

1. **FIREBASE_PROJECT_ID**
   - Value: `better-white-elephant` (or your project ID)

2. **FIREBASE_PRIVATE_KEY**
   - Get from: Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Copy the entire `private_key` value (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
   - **Important:** Keep the `\n` characters or paste the entire multi-line string

3. **FIREBASE_CLIENT_EMAIL**
   - Get from the same service account JSON
   - Format: `firebase-adminsdk-xxxxx@better-white-elephant.iam.gserviceaccount.com`

### Server Configuration

4. **CLIENT_URL**
   - Value: `https://better-white-elephant.web.app` (your Firebase Hosting URL)

5. **REDIS_URL**
   - Value: The Redis URL from Step 4
   - Railway provides this automatically if you link the Redis service

6. **SERVER_PORT** (Optional)
   - Value: `3001` (or leave Railway's default `PORT`)

### Linking Redis (Alternative)

Instead of manually setting `REDIS_URL`, you can:
1. Go to your service → **Variables**
2. Click **"Reference Variable"**
3. Select your Redis service
4. Select `REDIS_URL`
5. Railway will automatically inject it

---

## Step 6: Deploy

1. Railway will automatically deploy when you:
   - Push to your GitHub repo, OR
   - Click **"Deploy"** in Railway dashboard

2. **Watch the logs:**
   - Go to **Deployments** tab
   - Click on the latest deployment
   - Watch for: `🚀 Server running on port 3001`
   - Watch for: `✅ Redis connected`

3. **Get your server URL:**
   - Go to **Settings** → **Networking**
   - Railway will generate a URL like: `https://your-app.up.railway.app`
   - Copy this URL!

---

## Step 7: Update Frontend

1. **Update GitHub Secret:**
   - Go to: https://github.com/Leftyshields/better-white-elephant/settings/secrets/actions
   - Edit `VITE_SERVER_URL`
   - Set to: `https://your-app.up.railway.app` (your Railway URL)

2. **Rebuild and redeploy frontend:**
   ```bash
   cd client
   VITE_SERVER_URL=https://your-app.up.railway.app npm run build
   cd ..
   firebase deploy --only hosting
   ```

   OR wait for the next GitHub Actions deployment (it will use the updated secret)

---

## Step 8: Test Your Server

Test that your server is working:

```bash
# Test the server is up
curl https://your-app.up.railway.app

# Test API endpoint (will require auth, but should not give CORS error)
curl -X POST https://your-app.up.railway.app/api/game/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

---

## Troubleshooting

### Server won't start
- Check logs in Railway dashboard
- Verify all environment variables are set
- Check that `FIREBASE_PRIVATE_KEY` includes the full key with `\n` characters

### Redis connection fails
- Verify `REDIS_URL` is set correctly
- Check Redis service is running in Railway
- Ensure Redis URL format is correct: `redis://default:password@host:port`

### CORS errors
- Verify `CLIENT_URL` is set to your Firebase Hosting URL
- Check server logs for CORS errors
- Ensure server CORS allows your frontend domain

### Port issues
- Railway uses `PORT` environment variable automatically
- Your server should use `process.env.PORT || 3001`
- Check that your server.js uses the PORT variable

---

## Railway Free Tier Limits

- **$5 credit/month** (usually enough for small projects)
- **512 MB RAM** per service
- **1 GB disk space**
- **100 GB egress/month**

For a game server, this should be plenty!

---

## Next Steps

After deployment:
1. ✅ Server is live at Railway URL
2. ✅ Frontend updated with server URL
3. ✅ Test the full application flow
4. ⏭️ Consider adding a custom domain to Railway (optional)

---

## Quick Reference

**Railway Dashboard:** https://railway.app/dashboard  
**Your Project:** https://railway.app/project/YOUR_PROJECT_ID

**Environment Variables Checklist:**
- [ ] FIREBASE_PROJECT_ID
- [ ] FIREBASE_PRIVATE_KEY (full key with \n)
- [ ] FIREBASE_CLIENT_EMAIL
- [ ] REDIS_URL (from Railway Redis service)
- [ ] CLIENT_URL (your Firebase Hosting URL)
- [ ] SERVER_PORT (optional, Railway provides PORT)

