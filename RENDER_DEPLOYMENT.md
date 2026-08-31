# Render deployment: Firebase and Google Sign-In

Avrrio Reader uses real Firebase Authentication in every deployed environment. There is no development-user or authentication-bypass mode.

## Required Render environment variables

Set these in the Render service's **Environment** page. Never commit their values to the repository.

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Console → Project Settings |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Console → Project Settings → Your apps |
| `OPENAI_API_KEY` | OpenAI Dashboard → API keys |
| `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` | tldraw dashboard → Licenses |
| `PREVIEW_LOCK_ENABLED` | `1` only when the preview password gate is required |
| `APP_PREVIEW_PASSWORD` | A strong password stored only in Render |

All `NEXT_PUBLIC_*` values are embedded during the Next.js build. After changing one, use **Clear build cache & deploy** rather than restarting the service.

## Google Sign-In setup

1. Enable Google in Firebase Console → Authentication → Sign-in method.
2. Add `thought-unit-reader.onrender.com` and every production custom domain to Firebase Authentication's authorized domains.
3. Confirm the Firebase Web app configuration belongs to the same Firebase project as Firestore and Storage.
4. Deploy the Firestore rules, Storage rules, and indexes tracked by `firebase.json` before testing persistence.

## Verification

Sign in with Google, upload a PDF, refresh, sign out and back in, and confirm the same Library item returns. If sign-in fails, inspect the Firebase Authentication error code and verify the authorized domain and build-time configuration; do not add a mock user or weaken Firebase rules.
