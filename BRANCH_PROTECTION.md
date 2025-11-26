# Branch Protection Setup Guide

This guide will help you protect your `main` branch on GitHub.

## Quick Setup (Web UI)

1. **Go to your repository on GitHub:**
   - Navigate to: https://github.com/Leftyshields/better-white-elephant

2. **Go to Settings:**
   - Click the **Settings** tab (top navigation)

3. **Navigate to Branches:**
   - In the left sidebar, click **Branches**

4. **Add Branch Protection Rule:**
   - Click **Add rule** or **Add branch protection rule**
   - In the "Branch name pattern" field, enter: `main`

5. **Configure Protection Settings:**

   **Recommended Settings:**
   
   ✅ **Protect matching branches**
   
   ✅ **Require a pull request before merging**
      - ✅ Require approvals: **1** (or more if you want)
      - ✅ Dismiss stale pull request approvals when new commits are pushed
      - ✅ Require review from Code Owners (if you have a CODEOWNERS file)
   
   ✅ **Require status checks to pass before merging**
      - ✅ Require branches to be up to date before merging
      - Select status checks:
        - `CI / lint-and-test (18.x)` (if available)
        - `CI / lint-and-test (20.x)` (if available)
        - `CI / Build` (if available)
        - `CodeQL / Analyze (javascript)` (if available)
   
   ✅ **Require conversation resolution before merging**
   
   ✅ **Do not allow bypassing the above settings**
      - ⚠️ **Important:** Uncheck "Allow specified actors to bypass required pull requests" unless you need it
   
   ✅ **Restrict who can push to matching branches**
      - Leave empty (only admins can push directly)
   
   ✅ **Do not allow force pushes**
   
   ✅ **Do not allow deletions**
   
   ✅ **Require linear history** (optional, but recommended for clean history)
   
   ✅ **Include administrators** (recommended - even admins must follow rules)

6. **Save the rule:**
   - Click **Create** or **Save changes**

## Alternative: Using GitHub CLI

If you have GitHub CLI installed:

```bash
gh api repos/Leftyshields/better-white-elephant/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["CI / lint-and-test (18.x)","CI / lint-and-test (20.x)","CI / Build","CodeQL / Analyze (javascript)"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":false}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_linear_history=true
```

## What This Protects Against

- ✅ **Force pushes** - Prevents rewriting history
- ✅ **Branch deletion** - Prevents accidental deletion
- ✅ **Direct pushes** - Requires pull requests
- ✅ **Unreviewed code** - Requires code review
- ✅ **Failing tests** - Requires CI to pass
- ✅ **Merge conflicts** - Requires branch to be up to date

## After Setup

Once branch protection is enabled:

1. **All changes must go through Pull Requests**
2. **Pull Requests must be approved** (by at least 1 reviewer)
3. **CI checks must pass** before merging
4. **No force pushes** to main branch
5. **No direct commits** to main branch

## Making Changes to Main Branch

After protection is enabled, you'll need to:

1. Create a new branch: `git checkout -b feature/my-change`
2. Make your changes
3. Push the branch: `git push origin feature/my-change`
4. Create a Pull Request on GitHub
5. Wait for CI to pass
6. Get approval (if required)
7. Merge the PR

## Emergency Bypass

If you absolutely need to bypass protection (emergency fixes):

1. Go to **Settings** → **Branches**
2. Temporarily disable protection
3. Make your change
4. Re-enable protection immediately

⚠️ **Warning:** Only do this in true emergencies and document why.

## Status Check Names

After your first CI run, you'll see status checks available. Common names:
- `CI / lint-and-test (18.x)`
- `CI / lint-and-test (20.x)`
- `CI / Build`
- `CodeQL / Analyze (javascript)`

You can add these after your first workflow run completes.

