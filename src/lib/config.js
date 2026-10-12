// Kept separate from firebase.js so pages can check configuration
// without downloading the Firebase SDK.

// Local preview mode (`npm run dev:local`): talks to the Firebase emulators
// running on this computer instead of a real Firebase project.
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

export const firebaseConfig = useEmulators
  ? {
      apiKey: 'demo-key',
      authDomain: 'demo-cafebook.firebaseapp.com',
      projectId: 'demo-cafebook',
      storageBucket: 'demo-cafebook.appspot.com',
      appId: 'demo-app',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Same machine the page was loaded from, so phones on the same Wi-Fi work too.
export const emulatorHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
