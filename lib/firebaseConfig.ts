import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import { createClient } from '@supabase/supabase-js';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// --- ROBUST SINGLETON INITIALIZATION ---
let app;

if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
} else {
    // If it already exists, use the existing one
    app = firebase.app();
    
    // Optional: If you suspect the config is actually changing during dev, 
    // you can force delete and re-init (Uncomment ONLY if the error persists)
    // app.delete().then(() => firebase.initializeApp(firebaseConfig));
}

// Named exports for specific services
export const db = app.firestore();
export const auth = app.auth();

// Export the main firebase instance
export { firebase };

// Supabase client
export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);