import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBlehEG6-drNvgjmdBtlrxFtiA6LgmzQSs',
  authDomain: 'split-it-80a37.firebaseapp.com',
  projectId: 'split-it-80a37',
  storageBucket: 'split-it-80a37.firebasestorage.app',
  messagingSenderId: '664811535679',
  appId: '1:664811535679:web:640c6012df0a969a14278a',
  measurementId: 'G-F7G70EZ5DC',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
