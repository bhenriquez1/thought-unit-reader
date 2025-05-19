// lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAnMPtQh8-e0L3NBNMma-izbfIcnijYK5w",
  authDomain: "thought-unit-reader.firebaseapp.com",
  projectId: "thought-unit-reader",
  storageBucket: "thought-unit-reader.appspot.com",
  messagingSenderId: "808239475880",
  appId: "1:808239475880:web:c66b9bf6c553477f78269d",
  measurementId: "G-5DF8KCFLFG",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, provider, db, storage };
