# Render Deployment Guide - Fix Google Sign-In Error

## Problem
You're getting "Google Sign-In failed (auth/api-key-not-valid)" error on your Render deployment at `thought-unit-reader.onrender.com` because the bypass environment variable is not set in production.

## Solution: Add Environment Variable to Render

### Step 1: Access Render Dashboard
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Find your `thought-unit-reader` service
3. Click on your service name

### Step 2: Add Environment Variable
1. Go to the **Environment** tab
2. Click **Add Environment Variable**
3. Add the following:
   - **Key**: `NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN`
   - **Value**: `1`
4. Click **Save Changes**

### Step 3: Redeploy
1. Go to the **Deployments** tab
2. Click **Deploy Latest Commit** or wait for auto-deploy
3. Wait for deployment to complete

## Alternative: Set All Required Environment Variables

If you haven't set up your environment variables on Render yet, add all of these:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAnMPtQh8-eOL3NBNMMa-izbfIcnijYK5w
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=thought-unit-reader.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=thought-unit-reader
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=thought-unit-reader.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=808239475880
NEXT_PUBLIC_FIREBASE_APP_ID=1:808239475880:web:c66b9bf6c553477f78269d
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-5DF8KCFLFG
PREVIEW_LOCK_ENABLED=1
APP_PREVIEW_PASSWORD=El3n@&AmmayahH3nriqu3z2026
NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN=1
```

## What This Does
- **Disables Google Sign-In**: Prevents the authentication error
- **Uses Mock User**: App behaves as if you're logged in
- **Maintains Privacy**: Password gate still protects your app
- **Full Functionality**: All features work normally

## After Deployment
1. Visit `https://thought-unit-reader.onrender.com`
2. Enter your password: `El3n@&AmmayahH3nriqu3z2026`
3. App should work without Google Sign-In errors

## To Re-enable Google Sign-In Later
1. Add your Render domain to Firebase Auth authorized domains
2. Change `NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN` to `0` on Render
3. Redeploy

## Troubleshooting
- If you still get errors, check the browser console for more details
- Ensure all environment variables are set correctly
- Try a hard refresh (Ctrl+F5) after deployment
