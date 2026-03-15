import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { initializeAuth, Auth, getAuth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let functions: Functions;

function initializeFirebase() {
    console.log('[Firebase] Initializing...');
    if (getApps().length === 0) {
        app = initializeApp(firebaseConfig);
        console.log('[Firebase] App initialized');

        // @ts-ignore - getReactNativePersistence might be missing from types
        const { getReactNativePersistence } = require('firebase/auth');

        auth = initializeAuth(app, {
            persistence: getReactNativePersistence(ReactNativeAsyncStorage)
        });
        console.log('[Firebase] Auth initialized with persistence');
    } else {
        app = getApps()[0];
        auth = getAuth(app);
        console.log('[Firebase] App reused');
    }
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'us-central1');
    return { app, auth, db, storage, functions };
}

const firebase = initializeFirebase();
export const { auth: firebaseAuth, db: firebaseDb, storage: firebaseStorage, functions: firebaseFunctions } = firebase;
