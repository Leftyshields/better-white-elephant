# Fix: Site Not Found for stealorreveal.com

Your domain is "Connected" in Firebase, but it's still showing "Site Not Found". This means the A records aren't pointing to Firebase yet.

## Quick Fix Steps

### Step 1: Get Firebase A Records

1. Go to: https://console.firebase.google.com/project/better-white-elephant/hosting
2. Click on `stealorreveal.com` in the Domains list
3. Firebase will show you **A records** to add (usually 2-4 IP addresses)
4. **Copy these IP addresses**

### Step 2: Update A Records in IONOS

1. Go to: https://my.ionos.com/domain-dns-settings/stealorreveal.com
2. Find your current A records:
   - You likely have `@` pointing to `199.36.158.100`
   - You may have `www` pointing to `199.36.158.100`
3. **Replace** the A records:
   - Click edit (pencil icon) on the `@` A record
   - Change the value to Firebase's first IP address
   - Save
4. **Add additional A records** if Firebase provided more than one:
   - Click "Add record"
   - Type: `A`
   - Name: `@`
   - Value: (Firebase's second IP)
   - Repeat for all Firebase IPs

### Step 3: Update www Subdomain (Required)

If you want `www.stealorreveal.com` to work too, you need to fix the DNS:

**Option 1: CNAME (Recommended)**
1. In IONOS, delete or edit the existing `www` A record pointing to `199.36.158.100`
2. Add a CNAME record:
   - Type: `CNAME`
   - Name: `www`
   - Value: `stealorreveal.com`
   - TTL: `3600`

**Option 2: A Record**
1. In IONOS, edit the `www` A record
2. Change the value from `199.36.158.100` to Firebase's IP address (same as your `@` record)

After updating, you also need to add `www.stealorreveal.com` to Firebase:
1. Go to Firebase Hosting → Domains
2. Click "Add custom domain"
3. Enter: `www.stealorreveal.com`
4. Firebase will verify and issue an SSL certificate for the www subdomain

### Step 4: Wait for DNS Propagation

1. Wait 5-30 minutes for DNS to propagate
2. Check using: https://dnschecker.org
   - Select "A" record type
   - Enter `stealorreveal.com`
   - Check if it shows Firebase's IPs (not `199.36.158.100`)
3. Once propagated, visit: https://stealorreveal.com
4. It should show your White Elephant app!

## Current Issue

- ✅ TXT record verified (domain shows "Connected")
- ❌ A records still pointing to old IP (`199.36.158.100`)
- ❌ Site not resolving to Firebase Hosting

## After Fixing

Once A records are updated:
- ✅ Domain will resolve to Firebase
- ✅ Firebase will automatically issue SSL certificate
- ✅ Site will be live at `https://stealorreveal.com`

## Quick Reference

**Firebase Console:** https://console.firebase.google.com/project/better-white-elephant/hosting  
**IONOS DNS:** https://my.ionos.com/domain-dns-settings/stealorreveal.com  
**DNS Checker:** https://dnschecker.org

