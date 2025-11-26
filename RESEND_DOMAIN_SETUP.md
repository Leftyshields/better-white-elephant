# Resend Domain Setup Guide

This guide will help you configure your custom domain with Resend so emails are sent from your domain instead of `onboarding@resend.dev`.

## Why Domain Verification?

By default, Resend uses `onboarding@resend.dev` which:
- Only works in testing mode
- Can only send to your verified email address
- May be blocked by spam filters
- Doesn't look professional

With domain verification, you can:
- Send emails to any recipient
- Use your custom domain (e.g., `noreply@yourdomain.com`)
- Improve deliverability
- Look more professional

---

## Step 1: Sign Up / Log In to Resend

1. Go to: https://resend.com
2. Sign up or log in to your account
3. Navigate to: **Domains** → **Add Domain**

---

## Step 2: Add Your Domain

1. Enter your domain (e.g., `yourdomain.com` or `better-white-elephant.com`)
2. Click **Add Domain**
3. Resend will generate DNS records you need to add

---

## Step 3: Add DNS Records

Resend will show you DNS records to add. You'll need to add these to your domain's DNS settings:

### Required Records:

1. **SPF Record** (TXT)
   - Name: `@` or your domain
   - Value: `v=spf1 include:resend.com ~all`

2. **DKIM Records** (TXT)
   - Resend will provide 2-3 DKIM records
   - Name: Something like `resend._domainkey` or `resend-dkim._domainkey`
   - Value: Long string provided by Resend

3. **DMARC Record** (TXT) - Optional but recommended
   - Name: `_dmarc`
   - Value: `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`

### Where to Add DNS Records:

**If using Firebase Hosting domain:**
- Firebase uses Google Domains/Cloud DNS
- Go to: Firebase Console → Your Project → Hosting → Custom Domain
- Click on your domain → **DNS Configuration**
- Add the records there

**If using external domain registrar:**
- Go to your domain registrar's DNS management (e.g., Namecheap, GoDaddy, Google Domains)
- Find DNS settings / DNS management
- Add the TXT records provided by Resend

---

## Step 4: Verify Domain

1. After adding DNS records, go back to Resend
2. Click **Verify Domain**
3. Resend will check DNS records (can take a few minutes to 24 hours)
4. Once verified, you'll see a green checkmark ✅

---

## Step 5: Configure Firebase Functions

### Option A: Set Environment Variable (Recommended)

1. **Get your Resend API Key:**
   - Go to: https://resend.com/api-keys
   - Copy your API key

2. **Set Firebase Secret:**
   ```bash
   firebase functions:secrets:set RESEND_API_KEY
   ```
   - Paste your API key when prompted

3. **Set RESEND_FROM_EMAIL:**
   ```bash
   firebase functions:config:set resend.from_email="noreply@yourdomain.com"
   ```
   Or set it as a secret:
   ```bash
   firebase functions:secrets:set RESEND_FROM_EMAIL
   ```
   - Enter: `noreply@yourdomain.com` (or whatever email you want)

### Option B: Update Code to Use Secret

Update `functions/index.js` to use the secret:

```javascript
const resendFromEmail = defineSecret('RESEND_FROM_EMAIL');

// Then in the email send:
from: resendFromEmail.value() || 'White Elephant <onboarding@resend.dev>',
```

---

## Step 6: Update Firebase Functions Code

Update the `from` email in your functions:

```javascript
// In functions/index.js, line 73 and 152
from: process.env.RESEND_FROM_EMAIL || 'White Elephant <noreply@yourdomain.com>',
```

Or use a secret:

```javascript
const resendFromEmail = defineSecret('RESEND_FROM_EMAIL');

// In sendPartyInvite:
from: resendFromEmail.value() || 'White Elephant <noreply@yourdomain.com>',

// In notifyGiftSubmitter:
from: resendFromEmail.value() || 'White Elephant <noreply@yourdomain.com>',
```

---

## Step 7: Redeploy Functions

After updating:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

---

## Step 8: Test Email Delivery

1. Send a test invite from your app
2. Check the recipient's inbox (and spam folder)
3. Verify the "From" address shows your domain
4. Check Resend dashboard for delivery status

---

## Troubleshooting

### Emails Not Sending

1. **Check Resend Dashboard:**
   - Go to: https://resend.com/emails
   - Look for failed sends and error messages

2. **Verify DNS Records:**
   - Use a DNS checker: https://mxtoolbox.com
   - Enter your domain and check SPF/DKIM records

3. **Check Firebase Functions Logs:**
   ```bash
   firebase functions:log
   ```
   Look for Resend errors

### Domain Not Verifying

1. **Wait 24-48 hours** - DNS propagation can take time
2. **Double-check DNS records** - Make sure they're exactly as Resend provided
3. **Check for typos** - DNS records are case-sensitive
4. **Remove old records** - If you had previous email setup, remove conflicting records

### Emails Going to Spam

1. **Set up DMARC** (if not already done)
2. **Warm up your domain** - Start with low volume
3. **Use a subdomain** - Consider `mail.yourdomain.com` instead of root domain
4. **Check SPF/DKIM** - Ensure they're properly configured

---

## Quick Reference

**Resend Dashboard:** https://resend.com  
**Domain Settings:** https://resend.com/domains  
**API Keys:** https://resend.com/api-keys  
**Email Logs:** https://resend.com/emails

**Firebase Functions Secrets:**
```bash
# List secrets
firebase functions:secrets:access RESEND_API_KEY

# Set secret
firebase functions:secrets:set RESEND_API_KEY

# Deploy with secrets
firebase deploy --only functions
```

---

## Example DNS Records

Here's what your DNS records might look like:

```
Type: TXT
Name: @
Value: v=spf1 include:resend.com ~all

Type: TXT
Name: resend._domainkey
Value: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

---

## Next Steps

After domain verification:
1. ✅ Update `RESEND_FROM_EMAIL` in Firebase Functions
2. ✅ Redeploy functions
3. ✅ Test email delivery
4. ✅ Monitor Resend dashboard for delivery rates

Your emails will now be sent from your custom domain! 🎉

