#!/bin/bash
# Deploy Firebase Functions

set -e

echo "🚀 Deploying Firebase Functions..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged into Firebase. Run: firebase login"
    exit 1
fi

# Check if secrets are set
echo "📋 Checking secrets..."
if ! firebase functions:secrets:access RESEND_API_KEY &> /dev/null; then
    echo "⚠️  RESEND_API_KEY secret not set. Set it with:"
    echo "   firebase functions:secrets:set RESEND_API_KEY"
    read -p "Do you want to set it now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        firebase functions:secrets:set RESEND_API_KEY
    else
        echo "❌ Cannot deploy without RESEND_API_KEY"
        exit 1
    fi
fi

if ! firebase functions:secrets:access RESEND_FROM_EMAIL &> /dev/null; then
    echo "⚠️  RESEND_FROM_EMAIL secret not set. Set it with:"
    echo "   firebase functions:secrets:set RESEND_FROM_EMAIL"
    read -p "Do you want to set it now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        firebase functions:secrets:set RESEND_FROM_EMAIL
    else
        echo "❌ Cannot deploy without RESEND_FROM_EMAIL"
        exit 1
    fi
fi

# Install dependencies
echo "📦 Installing dependencies..."
cd functions
npm install
cd ..

# Deploy
echo "🚀 Deploying functions..."
firebase deploy --only functions

echo "✅ Deployment complete!"
echo ""
echo "Functions deployed:"
echo "  - sendPartyInvite"
echo "  - sendContactEmail"
echo "  - notifyGiftSubmitter"
echo "  - dataRetentionCleanup (scheduled)"
echo ""
echo "Test the contact form at: https://your-domain.com/contact"

