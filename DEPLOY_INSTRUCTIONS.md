# Deploy Firebase Functions - Quick Guide

## Step 1: Upgrade to Blaze Plan
1. Visit: https://console.firebase.google.com/project/better-white-elephant/usage/details
2. Click "Upgrade" to Blaze plan
3. Complete the upgrade process

## Step 2: Set Environment Variables

### Option A: Using Firebase Console (Easiest)
1. Go to: https://console.firebase.google.com/project/better-white-elephant/functions
2. Click on your function → Configuration
3. Add environment variable:
   - Key: `RESEND_API_KEY`
   - Value: `re_your_actual_resend_api_key`
4. Add another:
   - Key: `CLIENT_URL`
   - Value: `http://sandbox-mac-mini.local:5173`

### Option B: Using Firebase CLI (After upgrade)
```bash
cd /home/brian/docker/better-white-elephant

# Set Resend API key (replace with your actual key from functions/.env)
firebase functions:secrets:set RESEND_API_KEY

# This will prompt you to enter the secret value
# Enter your Resend API key (starts with re_)

# Set CLIENT_URL as regular env var
firebase functions:config:set client.url="http://sandbox-mac-mini.local:5173"
```

## Step 3: Deploy
```bash
cd /home/brian/docker/better-white-elephant
firebase deploy --only functions
```

## Step 4: Verify
After deployment, the function URL will be:
`https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite`

Test it:
```bash
curl -X POST https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","partyId":"test","hostName":"Test"}'
```

