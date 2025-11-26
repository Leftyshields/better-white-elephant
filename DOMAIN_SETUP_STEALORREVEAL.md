# Complete Domain Setup Guide: stealorreveal.com

This guide will help you set up `stealorreveal.com` for Firebase Hosting and Resend email.

---

## Part 1: Add Domain to Firebase Hosting

### Step 1: Add Custom Domain in Firebase

1. Go to: https://console.firebase.google.com/project/better-white-elephant/hosting
2. Click **"Add custom domain"**
3. Enter: `stealorreveal.com`
4. Click **"Continue"**
5. Firebase will show you DNS records to add

### Step 2: Firebase Will Show You Records Like:

- **A Record:**
  - Type: `A`
  - Name: `@` (or blank)
  - Value: `151.101.1.195` (example - use Firebase's actual IP)

- **A Record:**
  - Type: `A`
  - Name: `@` (or blank)
  - Value: `151.101.65.195` (example - use Firebase's actual IP)

**Note:** Firebase may also provide AAAA records (IPv6) - add those too if provided.

---

## Part 2: Add DNS Records in IONOS

### Step 1: Access DNS Settings in IONOS

1. Go to: https://my.ionos.com/domain-details/stealorreveal.com
2. Click on the **"DNS"** tab
3. Or click **"> Modify DNS Settings"** from the Details page

### Step 2: Add Firebase Hosting Records

Add the A records Firebase provided:

1. Click **"Add record"** or **"+"**
2. Add each A record:
   - **Type:** `A`
   - **Name:** `@` (or leave blank for root domain)
   - **Value:** (IP address from Firebase)
   - **TTL:** `3600` or default

3. Repeat for all A records Firebase provided

### Step 3: Verify Domain in Firebase

1. Go back to Firebase Console
2. Click **"Verify"** next to your domain
3. Wait a few minutes for DNS propagation
4. Once verified, Firebase will issue an SSL certificate automatically

---

## Part 3: Set Up Resend Email Domain

### Step 1: Add Domain in Resend

1. Go to: https://resend.com/domains
2. Click **"Add Domain"**
3. Enter: `stealorreveal.com`
4. Click **"Add Domain"**

### Step 2: Add Resend DNS Records in IONOS

Resend will show you these records. Add them in IONOS DNS settings:

#### 1. Domain Verification (DKIM) - Required
- **Type:** `TXT`
- **Name:** `resend._domainkey`
- **Value:** `p=MIGfMAOGCSqGSIb3DQEB...` (full value from Resend)
- **TTL:** `3600`

#### 2. Enable Sending (SPF) - Required
- **Type:** `TXT`
- **Name:** `send`
- **Value:** `v=spf1 include:amazons...` (full value from Resend)
- **TTL:** `3600`

#### 3. Enable Sending (MX) - Required
- **Type:** `MX`
- **Name:** `send`
- **Value:** `feedback-smtp.us-east-1.amazonaws.com` (or whatever Resend provides)
- **Priority:** `10`
- **TTL:** `3600`

#### 4. DMARC (Optional but Recommended)
- **Type:** `TXT`
- **Name:** `_dmarc`
- **Value:** `v=DMARC1; p=none; rua=mailto:dmarc@stealorreveal.com`
- **TTL:** `3600`

### Step 3: Verify Domain in Resend

1. After adding all DNS records, go back to Resend
2. Click **"I've added the records"**
3. Resend will verify (can take a few minutes to 24 hours)
4. Once verified, you'll see a green checkmark ✅

---

## Part 4: Update Firebase Functions

### Step 1: Set Firebase Secrets

```bash
# Set Resend API key (if not already set)
firebase functions:secrets:set RESEND_API_KEY
# Paste your Resend API key when prompted

# Set custom from email
firebase functions:secrets:set RESEND_FROM_EMAIL
# Enter: noreply@stealorreveal.com
```

### Step 2: Update CLIENT_URL Environment Variable

You may want to set this for the invite links:

```bash
firebase functions:config:set client.url="https://stealorreveal.com"
```

Or update the code to use the domain directly.

### Step 3: Redeploy Functions

```bash
cd /home/brian/docker/better-white-elephant
firebase deploy --only functions
```

---

## Part 5: Update Frontend Configuration

### Step 1: Update Firebase Hosting Configuration

The domain should automatically work once DNS is configured, but verify:

1. Go to: https://console.firebase.google.com/project/better-white-elephant/hosting
2. Verify `stealorreveal.com` shows as "Connected"
3. SSL certificate should be automatically issued

### Step 2: Test the Domain

1. Visit: https://stealorreveal.com
2. It should show your White Elephant app
3. Test email sending from the app

---

## Part 6: IONOS DNS Record Summary

Here's what your DNS records should look like in IONOS:

### Firebase Hosting Records:
```
Type: A
Name: @
Value: [Firebase IP 1]
TTL: 3600

Type: A
Name: @
Value: [Firebase IP 2]
TTL: 3600
```

### Resend Email Records:
```
Type: TXT
Name: resend._domainkey
Value: [Resend DKIM key]
TTL: 3600

Type: TXT
Name: send
Value: [Resend SPF value]
TTL: 3600

Type: MX
Name: send
Value: [Resend MX value]
Priority: 10
TTL: 3600

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@stealorreveal.com
TTL: 3600
```

---

## Troubleshooting

### Domain Not Resolving

1. **Check DNS Propagation:**
   - Use: https://dnschecker.org
   - Enter `stealorreveal.com` and check A records
   - Wait up to 48 hours for full propagation

2. **Verify Records in IONOS:**
   - Make sure all records are exactly as provided
   - Check for typos
   - Ensure TTL values are set

### Email Not Sending

1. **Check Resend Dashboard:**
   - Go to: https://resend.com/emails
   - Look for failed sends and error messages

2. **Verify DNS Records:**
   - Use: https://mxtoolbox.com
   - Check SPF, DKIM, and DMARC records

3. **Check Firebase Functions Logs:**
   ```bash
   firebase functions:log
   ```

### SSL Certificate Issues

- Firebase automatically issues SSL certificates
- Can take up to 24 hours after domain verification
- Check Firebase Hosting console for SSL status

---

## Quick Reference

**Firebase Console:** https://console.firebase.google.com/project/better-white-elephant/hosting  
**IONOS DNS:** https://my.ionos.com/domain-details/stealorreveal.com  
**Resend Dashboard:** https://resend.com/domains  
**DNS Checker:** https://dnschecker.org  
**MX Toolbox:** https://mxtoolbox.com

---

## Next Steps After Setup

1. ✅ Domain added to Firebase Hosting
2. ✅ DNS records added in IONOS
3. ✅ Domain verified in Firebase
4. ✅ Domain verified in Resend
5. ✅ Firebase secrets configured
6. ✅ Functions redeployed
7. ✅ Test email sending
8. ✅ Monitor Resend dashboard

Your domain `stealorreveal.com` will now:
- Host your frontend at `https://stealorreveal.com`
- Send emails from `noreply@stealorreveal.com`
- Have automatic SSL certificates
- Look professional! 🎉

