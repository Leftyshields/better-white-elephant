# Deploy Firebase Functions

## Prerequisites
- Firebase project upgraded to Blaze plan
- Resend API key (get from https://resend.com/api-keys)

## Steps to Deploy

1. **Set Environment Variables** (after Blaze upgrade):
   ```bash
   cd /home/brian/docker/better-white-elephant
   
   # Set Resend API key (replace with your actual key)
   firebase functions:config:set resend.api_key="re_your_actual_api_key_here"
   
   # Set client URL for invite links
   firebase functions:config:set client.url="http://sandbox-mac-mini.local:5173"
   ```

2. **Update functions/index.js** to use Firebase config:
   The code currently uses `process.env.RESEND_API_KEY`. 
   Firebase Functions v2 needs to read from `functions.config()` or use `.env` file.
   
   For Firebase Functions v2, we need to use runtime config or environment variables.

3. **Deploy Functions**:
   ```bash
   firebase deploy --only functions
   ```

4. **Verify Deployment**:
   The function URL will be:
   `https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite`

## Note on Environment Variables

Firebase Functions v2 uses different methods:
- For secrets: Use Firebase Secret Manager
- For config: Use runtime config (deprecated) or environment variables

The current code uses `process.env.RESEND_API_KEY` which works with:
- Local `.env` files (for emulator)
- Firebase Secret Manager (for production)
- Or we can switch to using `functions.config()`

