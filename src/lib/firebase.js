import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

// We can import the existing config directly, or redefine it here.
// But to ensure we don't break, let's redefine it here or use the window.AAHARSETU_CONFIG if available.
// Since React runs differently, it's safer to define the env config directly here.
const firebaseConfig = {
  apiKey: "AIzaSyB6MtJa7JApePvOuF31rwkfLnfeaoER4J4",
  authDomain: "aaharsetu-23cb4.firebaseapp.com",
  projectId: "aaharsetu-23cb4",
  storageBucket: "aaharsetu-23cb4.firebasestorage.app",
  messagingSenderId: "440003562837",
  appId: "1:440003562837:web:cbeb6ab3b7bb7f194bb3dc"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Explicitly set persistence
setPersistence(auth, browserLocalPersistence).catch(console.error);

// Promise to await initial auth state
export const firebaseReady = new Promise((resolve) => {
  const unsubscribe = auth.onAuthStateChanged((user) => {
    resolve(user);
    unsubscribe();
  });
});
