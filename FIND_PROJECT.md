# Finding the better-white-elephant Project

If the project doesn't appear in Google Cloud Console, try these methods:

## Method 1: Firebase Console (Easiest)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Look for `better-white-elephant` in your project list
3. Click on it to open the project
4. Go to ⚙️ **Project settings**
5. The API key is visible in the **SDK setup and configuration** section

## Method 2: Search in GCP Console

1. In Google Cloud Console, click the project selector dropdown
2. Click the **"All"** tab (not "Recent")
3. Type `better-white-elephant` in the search box
4. Select the project if it appears

## Method 3: Direct URL

Try accessing the project directly:
- **Firebase Console**: https://console.firebase.google.com/project/better-white-elephant
- **GCP Console**: https://console.cloud.google.com/home/dashboard?project=better-white-elephant

## Method 4: Check Account/Organization

The project might be under:
- A different Google account (personal vs work)
- A different organization
- A team/company account you need access to

**To check:**
1. Look at the account selector in the top-right of GCP Console
2. Switch accounts if you have multiple Google accounts
3. Check if you need to request access from the project owner

## Method 5: Via Firebase CLI

If you have Firebase CLI installed and authenticated:

```bash
cd /home/brian/docker/better-white-elephant
firebase projects:list
firebase use better-white-elephant
firebase projects:list --json
```

This will show all projects you have access to.

## Method 6: Check GitHub Secrets

The project ID might be stored in GitHub Secrets:
1. Go to your GitHub repo: `Leftyshields/better-white-elephant`
2. Settings → Secrets and variables → Actions
3. Check `VITE_FIREBASE_PROJECT_ID` - this will confirm the exact project ID

## If Project Doesn't Exist

If you can't find the project anywhere:
1. The project may have been deleted
2. You may have lost access
3. The project might be under a different name/ID
4. Check Firebase Console for any projects you own

## Accessing API Keys via Firebase Console

Even if you can't access GCP Console, you can still manage API keys:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select `better-white-elephant`
3. ⚙️ → **Project settings** → **Service accounts**
4. Or use the direct link: https://console.firebase.google.com/project/better-white-elephant/settings/general

The API key is also visible in the web app configuration under **SDK setup and configuration**.
