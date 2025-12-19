# Security Fix: Exposed Google API Key

## Issue
A Google API key was exposed in a Playwright trace file committed to GitHub:
- **Key**: `AIzaSyDT0GusMOKItyhoDPvCxZbs8OKvaIhFO7c`
- **Location**: `client/test-results/edge-cases-Edge-Cases-all-players-skip---game-continues-chromium/trace.zip`
- **Commit**: `d49b98530c941c6748932e3e1ad1ce3d8d738b08`

## Immediate Actions Taken

1. ✅ **Updated `.gitignore`** to exclude:
   - `client/test-results/` (all test results)
   - `**/*trace.zip` (all trace files)
   - `playwright-report/` and `playwright/.cache/`

2. ✅ **Updated Playwright config** to disable traces by default:
   - Changed `trace: 'on-first-retry'` to `trace: 'off'`
   - Prevents future capture of sensitive data in trace files

## Required Actions (YOU MUST DO THESE)

### 1. Regenerate the Compromised API Key

**Option A: Via Firebase Console (Recommended for Firebase projects):**
1. Go to [Firebase Console - better-white-elephant](https://console.firebase.google.com/project/better-white-elephant)
2. Click the gear icon ⚙️ → **Project settings**
3. Scroll down to **Your apps** section
4. Find your web app and click the gear icon next to it
5. Under **SDK setup and configuration**, you'll see the API key
6. To regenerate, use the direct link below or go to Google Cloud Console

**Direct link to API Keys in GCP:**
- [Credentials Page for better-white-elephant](https://console.cloud.google.com/apis/credentials?project=better-white-elephant)
- Project Number: `608342583094`
- Project ID: `better-white-elephant`

7. Find the API key: `AIzaSyDT0GusMOKItyhoDPvCxZbs8OKvaIhFO7c`
8. Click **Edit** → **Regenerate key**
9. Copy the new key

**Option B: Direct GCP Console Link (Fastest):**
Use this direct link to access the credentials page:
- **[Direct Link to API Keys](https://console.cloud.google.com/apis/credentials?project=better-white-elephant)**

Or manually:
1. Go to [Google Cloud Console - better-white-elephant](https://console.cloud.google.com/home/dashboard?project=better-white-elephant)
2. Navigate to **APIs & Services** → **Credentials**
3. Find the API key: `AIzaSyDT0GusMOKItyhoDPvCxZbs8OKvaIhFO7c`
4. Click **Edit** (pencil icon)
5. Click **Regenerate key** button
6. Copy the new key

**If the direct link doesn't work:**
- The project exists (confirmed via Firebase CLI: Project #608342583094)
- Try the "All" tab in project selector and search for `better-white-elephant`
- Or use Firebase Console method above

**If project is not found:**
- The project might be under a different Google account
- Check if you have access via Firebase Console instead
- The project might have been deleted (check Firebase Console)
- You may need to be added as a collaborator to the project

**Update Firebase/Deployment Environments:**

Since this app runs on Firebase Hosting, the API key is embedded in the built JavaScript bundle. You need to update it in multiple places:

**A. Update GitHub Secrets (for CI/CD):**
1. Go to your GitHub repository: `Leftyshields/better-white-elephant`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Find `VITE_FIREBASE_API_KEY` secret
4. Click **Update** and paste the new API key
5. Save the secret

**B. Update Local Development:**
1. Update `client/.env` with the new `VITE_FIREBASE_API_KEY`
2. Restart your local dev server if running

**C. Redeploy to Firebase Hosting:**
After updating the GitHub secret, trigger a new deployment:
```bash
# Option 1: Push to main branch (triggers auto-deploy)
git push origin main

# Option 2: Manually trigger GitHub Actions workflow
# Go to Actions tab → "Deploy to Firebase Hosting" → "Run workflow"
```

**Important:** The old API key will remain in previously deployed builds until you redeploy. The key is embedded in the JavaScript bundle, so all existing deployments contain the compromised key.

### 2. Add API Key Restrictions (Recommended)

In Google Cloud Console, after regenerating:
1. Edit the API key
2. Under **API restrictions**, select **Restrict key**
3. Choose only the APIs you need:
   - Firebase Authentication API
   - Cloud Firestore API
   - Firebase Cloud Messaging API (if used)
   - Firebase Realtime Database API (if used)
4. Under **Application restrictions**, select **HTTP referrers (web sites)**
5. Add your Firebase Hosting domains:
   - `https://better-white-elephant.web.app/*`
   - `https://better-white-elephant.firebaseapp.com/*`
   - `https://stealorreveal.com/*` (if you have a custom domain)
   - `http://localhost:5173/*` (for local development)
6. Save changes

**Note:** Since the API key is embedded in client-side JavaScript, HTTP referrer restrictions are your primary security measure. The key will be visible in the browser, but referrer restrictions prevent unauthorized domains from using it.

### 3. Remove Exposed Files from Git History

The trace file is already in Git history. To remove it:

```bash
# Option 1: Remove from current branch (if not pushed)
git rm -r --cached client/test-results/
git commit -m "Remove test-results containing sensitive data"

# Option 2: Remove from entire Git history (if already pushed)
# WARNING: This rewrites history. Coordinate with team first.
git filter-branch --force --index-filter \
  "git rm -rf --cached --ignore-unmatch client/test-results/" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (coordinate with team!)
git push origin --force --all
```

**Alternative (safer)**: Use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) or GitHub's support to remove sensitive files from history.

### 4. Verify No Other Exposures

Check for other exposed keys:
```bash
# Search for API keys in codebase
grep -r "AIzaSy" . --exclude-dir=node_modules --exclude-dir=.git

# Check Git history for the old key
git log -p -S "AIzaSyDT0GusMOKItyhoDPvCxZbs8OKvaIhFO7c" --all
```

### 5. Review Google Cloud Activity

1. Go to **APIs & Services** → **Dashboard**
2. Check for unusual API usage
3. Review billing for unexpected charges
4. Check **IAM & Admin** → **Audit Logs** for suspicious activity

## Prevention

✅ **Already implemented:**
- Test results excluded from Git
- Traces disabled by default
- API keys stored in environment variables (not hardcoded)

**Additional recommendations:**
- Use [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning) to detect future leaks
- Consider using [git-secrets](https://github.com/awslabs/git-secrets) pre-commit hook
- Regularly rotate API keys
- Use least-privilege API key restrictions
- Monitor Google Cloud audit logs

## Timeline

- **Immediate**: Regenerate API key, update GitHub Secrets, and redeploy to Firebase
- **Within 24 hours**: Remove from Git history (if needed)
- **Within 1 week**: Add API key restrictions and review audit logs

## Firebase-Specific Notes

⚠️ **Important for Firebase Hosting:**
- The API key is embedded in the built JavaScript bundle (`client/dist/`)
- All previous deployments contain the old compromised key
- You **must redeploy** after updating the GitHub secret to invalidate the old key in production
- The key will always be visible in client-side code (this is normal for Firebase web apps)
- Security relies on **HTTP referrer restrictions** in Google Cloud Console, not on key secrecy
- Consider using Firebase App Check for additional protection against abuse
