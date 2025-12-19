# Rebuild and Redeploy After API Key Replacement

## ✅ You've replaced the key in Google Cloud Console - Good!

Now you need to rebuild and redeploy so the new key is used in production.

## Step 1: Update GitHub Secret

1. Go to your GitHub repository: `Leftyshields/better-white-elephant`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Find `VITE_FIREBASE_API_KEY`
4. Click **Update**
5. Paste the **new** API key (the one you just regenerated)
6. Click **Update secret**

## Step 2: Rebuild Locally (Optional - for testing)

If you want to test locally first:

```bash
cd /home/brian/docker/better-white-elephant/client

# Make sure you have the new key in your .env file
# Then rebuild:
npm run build

# Verify the new key is in the build (not the old one):
grep -r "AIzaSyDT0GusMOKItyhoDPvCxZbs8OKvaIhFO7c" dist/ || echo "✅ Old key removed!"
```

## Step 3: Redeploy to Firebase Hosting

**Option A: Push to main branch (triggers auto-deploy)**
```bash
cd /home/brian/docker/better-white-elephant
git add .
git commit -m "Security: Update API key and exclude test-results"
git push origin main
```

**Option B: Manually trigger GitHub Actions**
1. Go to your GitHub repo
2. Click **Actions** tab
3. Select **"Deploy to Firebase Hosting"** workflow
4. Click **Run workflow** → **Run workflow** (green button)

## Step 4: Verify Deployment

After deployment completes:
1. Visit your site: https://better-white-elephant.web.app
2. Open browser DevTools → Network tab
3. Reload the page
4. Find the main JavaScript bundle (e.g., `index-*.js`)
5. Search for the old key: `AIzaSyDT0GusMOKItyhoDPvCxZbs8OKvaIhFO7c`
6. It should **NOT** be found (or replaced with the new key)

## Important Notes

⚠️ **The old key will remain in previously deployed builds until you redeploy!**

- The key is embedded in the JavaScript bundle at build time
- All existing deployments contain the old compromised key
- You **must redeploy** to invalidate the old key in production
- The old key will stop working once you regenerate it, but the old build files still contain it

## Clean Up Old Build Files

After redeploying, you can clean up the old local build:

```bash
cd /home/brian/docker/better-white-elephant/client
rm -rf dist/
```

The next build will use the new key from GitHub Secrets.
