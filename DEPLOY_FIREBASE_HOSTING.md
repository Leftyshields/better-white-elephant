# Deploy to Firebase Hosting

This guide will help you deploy the Better White Elephant frontend to Firebase Hosting.

## Prerequisites

1. Firebase CLI installed: `npm install -g firebase-tools`
2. Firebase project created and initialized
3. Git repository set up (already done)

## Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com/new) and create a new repository
2. **Do NOT** initialize with README, .gitignore, or license (we already have these)
3. Copy the repository URL

## Step 2: Push to GitHub

```bash
# Add the remote repository
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

## Step 3: Build the Client

Before deploying, you need to build the React app:

```bash
cd client
npm run build
cd ..
```

This will create the `client/dist` directory which Firebase Hosting will serve.

## Step 4: Deploy to Firebase Hosting

```bash
# Deploy hosting only
firebase deploy --only hosting

# Or deploy everything (hosting + functions + firestore rules)
firebase deploy
```

## Step 5: Verify Deployment

After deployment, Firebase will provide you with a hosting URL like:
- `https://YOUR_PROJECT_ID.web.app`
- `https://YOUR_PROJECT_ID.firebaseapp.com`

## Environment Variables for Production

Make sure your production environment variables are set:

### Client Environment Variables
The client uses `import.meta.env.VITE_*` variables. These need to be set at build time.

Create a `.env.production` file in the `client/` directory:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_SERVER_URL=https://your-server-url.com
```

Then rebuild:
```bash
cd client
npm run build
cd ..
firebase deploy --only hosting
```

## Continuous Deployment

GitHub Actions workflow is already set up! See `.github/workflows/deploy-firebase.yml`.

To enable automatic deployment:

```yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd client
          npm ci
      
      - name: Build
        run: |
          cd client
          npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_SERVER_URL: ${{ secrets.VITE_SERVER_URL }}
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-project-id
```

1. Add secrets to GitHub repository:
   - Go to Settings → Secrets and variables → Actions
   - Add all the VITE_* environment variables
   - Add FIREBASE_SERVICE_ACCOUNT (download from Firebase Console → Project Settings → Service Accounts)

2. The workflow will automatically deploy on pushes to `main` branch
   - Or manually trigger from Actions tab → Deploy to Firebase Hosting → Run workflow

## Troubleshooting

### Build fails
- Check that all environment variables are set
- Verify `client/package.json` has correct build script
- Check Node.js version (should be 18+)

### 404 errors on routes
- Verify `firebase.json` has the rewrite rule: `"source": "**", "destination": "/index.html"`
- This is already configured in the project

### Environment variables not working
- Remember: Vite only exposes variables prefixed with `VITE_`
- Rebuild after changing environment variables
- Check browser console for errors

## Next Steps

After deploying the frontend, you'll also need to:
1. Deploy the Node.js server to a cloud service (Railway, Render, etc.)
2. Deploy Firebase Functions: `firebase deploy --only functions`
3. Update Firestore rules: `firebase deploy --only firestore:rules`
4. Set up Redis (Upstash, Redis Cloud, etc.)

