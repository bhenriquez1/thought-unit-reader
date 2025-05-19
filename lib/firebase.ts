// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAnMPtQh8-eOL3NBNMMa-izbfIcnijYK5w",
  authDomain: "thought-unit-reader.firebaseapp.com",
  projectId: "thought-unit-reader",
  storageBucket: "thought-unit-reader.appspot.com",
  messagingSenderId: "808239475880",
  appId: "1:808239475880:web:c66b9bf6c553477f78269d", // <- replace with actual App ID from Firebase > Project Settings
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { app, auth, provider };