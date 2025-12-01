# Firebase Functions - Email Service

This directory contains Firebase Cloud Functions for sending emails via Resend API.

## Functions

- **`sendPartyInvite`** - Sends party invitation emails
- **`sendContactEmail`** - Handles contact form submissions  
- **`notifyGiftSubmitter`** - Notifies gift submitters when winners provide addresses
- **`dataRetentionCleanup`** - Scheduled daily cleanup (runs at 2 AM UTC)

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in this directory:

```bash
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=White Elephant <onboarding@resend.dev>
CONTACT_EMAIL=support@stealorreveal.com
```

**Get your Resend API key:**
1. Sign up at [resend.com](https://resend.com)
2. Go to API Keys in dashboard
3. Create a new API key
4. Copy the key (starts with `re_`)

### 3. Start Firebase Emulators

```bash
firebase emulators:start --only functions
```

The functions will be available at:
- `http://127.0.0.1:5001/better-white-elephant/us-central1/sendContactEmail`
- `http://127.0.0.1:5001/better-white-elephant/us-central1/sendPartyInvite`

### 4. Test Locally

The Contact form will automatically detect localhost and use the emulator URL.

Or test manually:
```bash
curl -X POST http://127.0.0.1:5001/better-white-elephant/us-central1/sendContactEmail \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "message": "Test message",
    "name": "Test User",
    "type": "general"
  }'
```

## Deployment

See [../DEPLOY_FUNCTIONS.md](../DEPLOY_FUNCTIONS.md) for deployment instructions.

Quick deploy:
```bash
./deploy.sh
```

Or manually:
```bash
# Set secrets (first time only)
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set RESEND_FROM_EMAIL

# Deploy
firebase deploy --only functions
```

## Troubleshooting

### "RESEND_API_KEY not found"
- Make sure `.env` file exists in `functions/` directory
- Check that the key starts with `re_`
- Restart the emulator after creating `.env`

### "Email sending limited"
- Resend is in testing mode
- You can only send to verified email addresses
- Verify your domain in Resend dashboard to send to any address

### Function not accessible
- Check that emulator is running: `firebase emulators:start --only functions`
- Verify the function URL matches your project ID
- Check browser console for CORS errors

