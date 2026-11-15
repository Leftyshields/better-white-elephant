# Backfill: leaked email local-part as displayName

The script `backfill-leaked-display-names.mjs` finds user and party-participant documents whose `displayName` equals the local-part of the account email, or is a full email address, and clears or replaces them using `pickDisplayName` rules.

## Usage

```bash
# Dry run (default) — prints JSON counts only
node scripts/backfill-leaked-display-names.mjs --project YOUR_FIREBASE_PROJECT_ID

# Apply writes (operator only, after reviewing dry-run counts)
node scripts/backfill-leaked-display-names.mjs --project YOUR_FIREBASE_PROJECT_ID --apply
```

Requires Firebase Admin credentials (`GOOGLE_APPLICATION_CREDENTIALS` or Application Default Credentials).

Output never includes emails, user ids, document paths, or other PII — only aggregate counts and generic error codes.

Run in a controlled environment after deploying the privacy fix in PR #84.