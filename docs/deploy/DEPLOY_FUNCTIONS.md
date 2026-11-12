# Deploying Firebase Functions

This guide explains how to deploy the Firebase Functions (email service) for Better White Elephant.

## Prerequisites

1. **Firebase CLI installed:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Logged into Firebase:**
   ```bash
   firebase login
   ```

3. **Resend API Key:**
   - Sign up at [resend.com](https://resend.com)
   - Get your API key from the dashboard
   - Verify your domain (or use the default `onboarding@resend.dev` for testing)

## Setting Up Secrets

Firebase Functions v2 uses secrets for sensitive data. Set them up:

```bash
# Set Resend API key
firebase functions:secrets:set RESEND_API_KEY

# Set from email address
firebase functions:secrets:set RESEND_FROM_EMAIL
```

When prompted, paste your values:
- `RESEND_API_KEY`: Your Resend API key (starts with `re_`)
- `RESEND_FROM_EMAIL`: Your verified email address (e.g., `White Elephant <noreply@yourdomain.com>`)

## Deploy Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

This will deploy:
- `sendPartyInvite` - Sends party invitation emails
- `sendContactEmail` - Handles contact form submissions
- `notifyGiftSubmitter` - Notifies gift submitters when winners provide addresses
- `dataRetentionCleanup` - Scheduled daily cleanup (runs at 2 AM UTC)

## Testing Locally

1. **Start Firebase Emulators:**
   ```bash
   firebase emulators:start --only functions
   ```

2. **Set up local environment:**
   Create `functions/.env` (copy from `functions/.env.example`):
   ```bash
   RESEND_API_KEY=re_your_key_here
   RESEND_FROM_EMAIL=White Elephant <onboarding@resend.dev>
   CONTACT_EMAIL=support@stealorreveal.com
   ```

3. **Update client to use emulator:**
   The Contact form automatically detects localhost and uses the emulator URL.

## Verifying Deployment

After deployment, you'll see output like:
```
✔  functions[sendContactEmail(us-central1)] Successful create operation.
Function URL: https://us-central1-better-white-elephant.cloudfunctions.net/sendContactEmail
```

Test the function:
```bash
curl -X POST https://us-central1-better-white-elephant.cloudfunctions.net/sendContactEmail \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "message": "Test message",
    "name": "Test User",
    "type": "general"
  }'
```

## Troubleshooting

### "Failed to fetch" Error
- **Function not deployed:** Run `firebase deploy --only functions`
- **Wrong URL:** Check the function URL in Firebase Console
- **CORS issues:** The function has CORS enabled, but check browser console for errors

### "Email sending limited" Error
- **Resend in testing mode:** You can only send to verified email addresses
- **Solution:** Verify your domain in Resend dashboard or use a verified email

### Secret Not Found
- **Secrets not set:** Run `firebase functions:secrets:set RESEND_API_KEY`
- **Wrong project:** Make sure you're in the correct Firebase project: `firebase use <project-id>`

## Updating Secrets

To update a secret:
```bash
firebase functions:secrets:set RESEND_API_KEY
# Enter new value when prompted
# Redeploy functions to use new secret
firebase deploy --only functions
```

## Monitoring

View function logs:
```bash
firebase functions:log
```

Or in Firebase Console:
1. Go to Firebase Console → Functions
2. Click on a function name
3. View logs and metrics

