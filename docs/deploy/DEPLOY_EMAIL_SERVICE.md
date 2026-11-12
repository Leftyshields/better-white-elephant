# Deploy Email Service - Quick Start

## Prerequisites

You have a Resend API key: `re_6oswwCMh...` (from your Resend dashboard)

## Deploy Steps

### 1. Set Firebase Secrets

```bash
# Set your Resend API key
firebase functions:secrets:set RESEND_API_KEY
# When prompted, paste: re_6oswwCMh... (your full API key)

# Set your from email address
firebase functions:secrets:set RESEND_FROM_EMAIL
# When prompted, paste: White Elephant <onboarding@resend.dev>
# Or use your verified domain: Your Name <noreply@yourdomain.com>
```

### 2. Deploy Functions

```bash
cd /home/brian/docker/better-white-elephant
firebase deploy --only functions
```

### 3. Verify Deployment

After deployment, you'll see:
```
✔  functions[sendContactEmail(us-central1)] Successful create operation.
Function URL: https://us-central1-better-white-elephant.cloudfunctions.net/sendContactEmail
```

### 4. Test It

Go to your contact form at `/contact` and submit a test message. It should work!

## Troubleshooting

**"Failed to fetch" error:**
- Function not deployed: Run `firebase deploy --only functions`
- Check Firebase Console → Functions to see if it's deployed

**"Email sending limited" error:**
- Resend is in testing mode
- You can only send to verified email addresses
- To send to any address, verify your domain in Resend dashboard

**Function not found:**
- Check project ID matches: `firebase use` to see current project
- Verify function name: `sendContactEmail`

## Quick Deploy Script

Or use the deploy script:
```bash
./functions/deploy.sh
```

