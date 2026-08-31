# Firebase Authentication Setup Guide

## Current Issue: "auth/api-key-not-valid" Error

If you're seeing the error "Google Sign-In failed (auth/api-key-not-valid.-please-pass-a-valid-api-key.)", this is most likely due to domain authorization issues, not an invalid API key.

## Solution: Add Authorized Domains

### Step 1: Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `thought-unit-reader`

### Step 2: Configure Authorized Domains
1. Navigate to **Authentication** → **Settings** → **Authorized domains**
2. Add the following domains:

**For Development:**
- `localhost` (if not already present)
- Your current codespace domain (check the URL in your browser)
- Example: `your-codespace-name-port.app.github.dev`

**For Production:**
- `thought-unit-reader.onrender.com` (your current Render deployment)
- Any other production domains you use

### Step 3: Enable Google Sign-In
1. Go to **Authentication** → **Sign-in method**
2. Enable **Google** if not already enabled
3. Configure the OAuth consent screen if prompted

## Current Configuration

Use the Firebase web-app configuration from Firebase Console → Project
Settings. Do not commit configuration values to this repository; set them in
`.env.local` or the deployment environment.

## Testing

After adding the authorized domains:
1. Restart your development server: `npm run dev`
2. Test authentication at: `http://localhost:3000/test-firebase.html`
3. Or test in your main application

## Common Issues

1. **Domain not authorized**: Add your current domain to Firebase Auth settings
2. **Google Sign-In not enabled**: Enable it in Firebase Console
3. **OAuth consent screen**: Configure it if you see related errors
4. **API key restrictions**: Check if your API key has HTTP referrer restrictions

## Environment Variables

Required environment-variable names:
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```
