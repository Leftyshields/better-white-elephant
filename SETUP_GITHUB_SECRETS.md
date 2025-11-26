# Setup GitHub Secrets for Deployment

The deployment workflow requires several secrets to be configured in your GitHub repository.

## Required Secrets

### 1. Go to GitHub Secrets Settings

1. Navigate to your repository: https://github.com/Leftyshields/better-white-elephant
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** for each secret below

### 2. Firebase Configuration Secrets

Add these secrets (get values from your Firebase project):

#### VITE_FIREBASE_API_KEY
- **Where to find:** Firebase Console → Project Settings → General → Your apps → Web app → API Key
- **Value:** `AIzaSyC...` (starts with `AIza`)

#### VITE_FIREBASE_AUTH_DOMAIN
- **Where to find:** Firebase Console → Project Settings → General → Your apps → Web app
- **Value:** `your-project-id.firebaseapp.com`

#### VITE_FIREBASE_PROJECT_ID
- **Where to find:** Firebase Console → Project Settings → General
- **Value:** Your Firebase project ID (e.g., `better-white-elephant`)

#### VITE_FIREBASE_STORAGE_BUCKET
- **Where to find:** Firebase Console → Project Settings → General → Your apps → Web app
- **Value:** `your-project-id.appspot.com`

#### VITE_FIREBASE_MESSAGING_SENDER_ID
- **Where to find:** Firebase Console → Project Settings → General → Your apps → Web app
- **Value:** A numeric ID (e.g., `123456789012`)

#### VITE_FIREBASE_APP_ID
- **Where to find:** Firebase Console → Project Settings → General → Your apps → Web app
- **Value:** `1:123456789012:web:abc123def456`

#### VITE_SERVER_URL (Optional - can add later)
- **What it is:** The URL of your Node.js game server (Socket.io server)
- **For now:** You can use `http://localhost:3001` as a placeholder
- **Later:** When you deploy your server to Railway, Render, or another service, update this to the actual URL
- **Value:** `http://localhost:3001` (placeholder) or your deployed server URL

### 3. Firebase Service Account (Most Important!)

This is required for deployment:

1. Go to Firebase Console: https://console.firebase.google.com/project/YOUR_PROJECT_ID/settings/serviceaccounts/adminsdk
2. Click **"Generate new private key"**
3. Click **"Generate key"** (this downloads a JSON file)
4. Open the downloaded JSON file
5. Copy the **entire contents** of the JSON file
6. In GitHub, create a secret named: `FIREBASE_SERVICE_ACCOUNT`
7. Paste the entire JSON content as the value

**⚠️ Important:** The JSON should look like:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  ...
}
```

## Quick Checklist

**Required for deployment:**
- [ ] VITE_FIREBASE_API_KEY
- [ ] VITE_FIREBASE_AUTH_DOMAIN
- [ ] VITE_FIREBASE_PROJECT_ID
- [ ] VITE_FIREBASE_STORAGE_BUCKET
- [ ] VITE_FIREBASE_MESSAGING_SENDER_ID
- [ ] VITE_FIREBASE_APP_ID
- [ ] FIREBASE_SERVICE_ACCOUNT (JSON content)

**Optional (can add later when server is deployed):**
- [ ] VITE_SERVER_URL (use `http://localhost:3001` as placeholder for now)

## Verify Secrets Are Set

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see all 8 secrets listed
3. The names must match exactly (case-sensitive!)

## Test Deployment

After adding all secrets:

1. Go to **Actions** tab
2. Select **"Deploy to Firebase Hosting"** workflow
3. Click **"Run workflow"** → **"Run workflow"**
4. Watch the workflow run - it should now succeed!

## Troubleshooting

### "Secret not found" error
- Double-check secret names match exactly (case-sensitive)
- Ensure you're in the correct repository

### "Invalid service account" error
- Make sure FIREBASE_SERVICE_ACCOUNT contains the full JSON
- Verify the JSON is valid (no extra spaces, proper formatting)

### Build fails
- Check that all VITE_* secrets are set
- Verify values are correct (no extra spaces)

### Deployment fails
- Verify FIREBASE_SERVICE_ACCOUNT is set correctly
- Check that the service account has proper permissions in Firebase

