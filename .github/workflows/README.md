# GitHub Actions Workflows

This directory contains CI/CD workflows for the Better White Elephant project.

## Workflows

### 🔄 CI (`ci.yml`)
Runs on every push and pull request to `main` and `develop` branches.

**What it does:**
- Tests code on Node.js 18.x and 20.x
- Installs all dependencies (root, client, server, functions)
- Lints and builds the client
- Checks syntax for server and functions
- Uploads build artifacts

**Status Badge:**
```markdown
![CI](https://github.com/leftyshields/better-white-elephant/workflows/CI/badge.svg)
```

### 🚀 Deploy to Firebase Hosting (`deploy-firebase.yml`)
Runs on pushes to `main` branch or can be manually triggered.

**What it does:**
- Builds the React client with production environment variables
- Deploys to Firebase Hosting
- Requires Firebase service account secret

**Required Secrets:**
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_SERVER_URL`
- `FIREBASE_SERVICE_ACCOUNT` (JSON service account key)

### 🔍 CodeQL Analysis (`codeql.yml`)
Runs security analysis on code.

**What it does:**
- Analyzes JavaScript code for security vulnerabilities
- Runs on pushes, PRs, and weekly schedule
- Helps identify potential security issues

### 🤖 Dependabot Auto-merge (`dependabot-auto-merge.yml`)
Automatically merges Dependabot PRs (optional).

**What it does:**
- Auto-merges Dependabot dependency update PRs
- Uses squash merge strategy
- Only runs for Dependabot PRs

## Setting Up Secrets

1. Go to your repository → **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:
   - All `VITE_*` environment variables
   - `FIREBASE_SERVICE_ACCOUNT` (download from Firebase Console → Project Settings → Service Accounts)

## Manual Workflow Trigger

You can manually trigger the deploy workflow:
1. Go to **Actions** tab
2. Select **Deploy to Firebase Hosting**
3. Click **Run workflow**
4. Select branch and click **Run workflow**

