# Complete Firebase Hosting Setup Guide

This guide will walk you through setting up Firebase Hosting and connecting your custom domain.

## Prerequisites

1. Firebase CLI installed: `npm install -g firebase-tools`
2. Firebase project created
3. Domain purchased (or ready to purchase)

---

## Part 1: Initial Firebase Setup

### Step 1: Login to Firebase CLI

```bash
firebase login
```

This will open your browser to authenticate.

### Step 2: Initialize Firebase (if not already done)

```bash
cd /home/brian/docker/better-white-elephant
firebase init
```

**Select:**
- ✅ Hosting
- ✅ Functions (if you want to deploy functions)
- ✅ Firestore (for rules)

**When prompted:**
- Use an existing project: **Yes**
- Select your project: `better-white-elephant` (or your project name)
- Public directory: `client/dist`
- Configure as single-page app: **Yes**
- Set up automatic builds: **No** (we'll use GitHub Actions)
- Overwrite index.html: **No**

### Step 3: Verify firebase.json

Your `firebase.json` should look like this:

```json
{
  "hosting": {
    "public": "client/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

---

## Part 2: Build and Deploy (First Time)

### Step 1: Build the Client

```bash
cd client
npm install  # If you haven't already
npm run build
cd ..
```

This creates the `client/dist` directory with your production build.

### Step 2: Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

**First time only:** You may need to enable Hosting API:
- Firebase will provide a link to enable it
- Click the link and enable the API
- Then run the deploy command again

### Step 3: Verify Deployment

After deployment, you'll get URLs like:
- `https://your-project-id.web.app`
- `https://your-project-id.firebaseapp.com`

Visit these URLs to verify your site is live!

---

## Part 3: Purchase and Connect Custom Domain

### Step 1: Purchase Domain

**Recommended Domain Registrars:**
- **Namecheap** (https://www.namecheap.com) - Good prices, easy to use
- **Google Domains** (https://domains.google) - Simple, integrates well
- **Cloudflare** (https://www.cloudflare.com/products/registrar) - At-cost pricing
- **GoDaddy** - Popular but more expensive

**Domain Suggestions:**
- `whiteelephant.games`
- `betterwhiteelephant.com`
- `giftexchange.app`
- `whiteelephantparty.com`

### Step 2: Add Custom Domain in Firebase

1. **Go to Firebase Console:**
   - https://console.firebase.google.com/project/YOUR_PROJECT_ID/hosting

2. **Click "Add custom domain"**

3. **Enter your domain:**
   - Example: `whiteelephant.games` or `www.whiteelephant.games`
   - Click "Continue"

4. **Choose domain type:**
   - **Apex domain** (e.g., `whiteelephant.games`) - Recommended
   - **Subdomain** (e.g., `www.whiteelephant.games`) - Also works

5. **Firebase will show you DNS records to add**

---

## Part 4: Configure DNS Records

Firebase will provide you with DNS records. Here's how to add them:

### For Apex Domain (whiteelephant.games)

Firebase will give you **A records** like:
```
Type: A
Name: @ (or leave blank)
Value: 151.101.1.195
Value: 151.101.65.195
```

**How to add (varies by registrar):**

#### Namecheap:
1. Go to Domain List → Manage
2. Click "Advanced DNS"
3. Add A records:
   - Host: `@`
   - Value: `151.101.1.195` (first IP)
   - TTL: Automatic
   - Click "Add"
   - Repeat for second IP

#### Google Domains:
1. Go to DNS → Custom records
2. Add A record:
   - Name: `@`
   - Type: `A`
   - Data: `151.101.1.195`
   - TTL: `3600`
   - Click "Add"
   - Repeat for second IP

#### Cloudflare:
1. Go to DNS → Records
2. Add A record:
   - Type: `A`
   - Name: `@`
   - IPv4 address: `151.101.1.195`
   - Proxy status: **DNS only** (gray cloud, not orange)
   - Click "Save"
   - Repeat for second IP

### For Subdomain (www.whiteelephant.games)

Firebase will give you a **CNAME record**:
```
Type: CNAME
Name: www
Value: your-project-id.web.app
```

**How to add:**
- Host: `www`
- Value: `your-project-id.web.app`
- TTL: Automatic

### Step 3: Verify Domain in Firebase

1. **After adding DNS records, go back to Firebase Console**
2. **Click "Verify"** in the domain setup
3. **Wait for verification** (can take a few minutes to 24 hours)
4. **Firebase will automatically provision SSL certificate** (HTTPS)

---

## Part 5: DNS Propagation

After adding DNS records:

1. **Wait 5-60 minutes** for DNS to propagate
2. **Check propagation:**
   ```bash
   # Check if DNS is resolving
   dig whiteelephant.games
   # or
   nslookup whiteelephant.games
   ```

3. **Once verified in Firebase**, your site will be available at:
   - `https://whiteelephant.games`
   - `https://www.whiteelephant.games` (if you set up www)

---

## Part 6: Set Up Both Apex and WWW (Recommended)

For best results, set up both:

1. **Add apex domain** (`whiteelephant.games`)
2. **Add www subdomain** (`www.whiteelephant.games`)
3. **Firebase will handle redirects automatically**

---

## Part 7: Update Environment Variables

After your domain is live, update:

1. **GitHub Secrets:**
   - `VITE_SERVER_URL` - When you deploy your server
   - `CLIENT_URL` - Your custom domain (for email invites)

2. **Firebase Functions:**
   ```bash
   firebase functions:config:set client.url="https://whiteelephant.games"
   ```

---

## Part 8: Automatic Deployment (GitHub Actions)

Once your domain is set up, the GitHub Actions workflow will automatically deploy on every push to `main`.

**Make sure you have these secrets set:**
- All `VITE_*` Firebase config secrets
- `FIREBASE_SERVICE_ACCOUNT` (JSON)

See `SETUP_GITHUB_SECRETS.md` for details.

---

## Troubleshooting

### DNS Not Resolving
- Wait longer (up to 24 hours for full propagation)
- Check DNS records are correct
- Use `dig` or `nslookup` to verify

### SSL Certificate Not Provisioned
- Wait 24-48 hours after domain verification
- Firebase automatically provisions SSL (free)
- Check Firebase Console → Hosting → Domains

### Domain Verification Failing
- Double-check DNS records match exactly
- Ensure TTL is set correctly
- Try removing and re-adding records

### Site Not Loading
- Check Firebase Console for deployment status
- Verify `client/dist` was built correctly
- Check browser console for errors

---

## Quick Reference

```bash
# Build client
cd client && npm run build && cd ..

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Deploy everything (hosting + functions + rules)
firebase deploy

# View hosting URLs
firebase hosting:channel:list
```

---

## Next Steps After Domain Setup

1. ✅ Domain connected and verified
2. ✅ SSL certificate active (automatic)
3. ⏭️ Deploy Node.js server (see `DEPLOY_SERVER.md`)
4. ⏭️ Update `VITE_SERVER_URL` in GitHub secrets
5. ⏭️ Test full application flow

---

## Cost

- **Firebase Hosting:** Free tier includes:
  - 10 GB storage
  - 360 MB/day data transfer
  - Custom domains (free)
  - SSL certificates (free, automatic)
  
- **Domain:** ~$10-15/year (varies by TLD)

**Total:** ~$10-15/year for domain + free hosting!

