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

## Required Environment Variables

Set all of these in the Render Dashboard **Environment** tab — never commit their values to the repository:

| Variable | Where to find the value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Console → Project Settings |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Console → Project Settings → Your apps |
| `OPENAI_API_KEY` | OpenAI Dashboard → API keys |
| `PREVIEW_LOCK_ENABLED` | Set to `1` to enable the password gate |
| `APP_PREVIEW_PASSWORD` | Choose a strong password; store only in Render |
| `NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN` | Set to `1` to bypass Google Sign-In |
| `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` | tldraw dashboard → Licenses. **Required** — without it, production shows "Whiteboard configuration is unavailable." instead of the Whiteboard canvas. |

### `NEXT_PUBLIC_*` variables require a full rebuild, not a restart

Every variable prefixed `NEXT_PUBLIC_` in the table above is inlined into the client JavaScript bundle **at build time** by Next.js — it is not read from the environment at request time. If you add or change one of these on an existing Render service, clicking **Manual Deploy → Restart Service** is not enough; the old build still has the old (or missing) value baked in. You must trigger an actual rebuild: **Manual Deploy → "Clear build cache & deploy"** (or push a new commit). Non-`NEXT_PUBLIC_` variables (e.g. `OPENAI_API_KEY`) are read server-side at runtime and don't have this restriction.

## What This Does
- **Disables Google Sign-In**: Prevents the authentication error
- **Uses Mock User**: App behaves as if you're logged in
- **Maintains Privacy**: Password gate still protects your app
- **Full Functionality**: All features work normally

## After Deployment
1. Visit `https://thought-unit-reader.onrender.com`
2. Enter your password (set via `APP_PREVIEW_PASSWORD` in Render)
3. App should work without Google Sign-In errors

## To Re-enable Google Sign-In Later
1. Add your Render domain to Firebase Auth authorized domains
2. Change `NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN` to `0` on Render
3. Redeploy

## Troubleshooting
- If you still get errors, check the browser console for more details
- Ensure all environment variables are set correctly
- Try a hard refresh (Ctrl+F5) after deployment
