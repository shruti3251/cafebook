import { deleteApp, initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { emulatorHost, firebaseConfig, useEmulators } from './config.js';

export { firebaseConfigured } from './config.js';

const cache = {};

function connectAuth(auth) {
  if (useEmulators) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  return auth;
}

/**
 * Customers and staff use two separate Firebase app instances so their logins
 * never mix - e.g. the owner can test the customer flow on the same phone
 * without being logged out of the dashboard.
 */
function getFirebase(name) {
  if (cache[name]) return cache[name];
  const app = getApps().find((a) => a.name === name) || initializeApp(firebaseConfig, name);
  const db = initializeFirestore(app, useEmulators ? {} : {
    // Offline cache: the menu still opens on a flaky connection.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (useEmulators) connectFirestoreEmulator(db, emulatorHost, 8080);
  cache[name] = { app, db, auth: connectAuth(getAuth(app)) };
  return cache[name];
}

export const customerFirebase = () => getFirebase('customer');
export const staffFirebase = () => getFirebase('staff');

/**
 * Creates an email/password login for a new staff member WITHOUT logging the
 * owner out (uses a throwaway Firebase app instance). Returns the new uid.
 */
export async function createLoginWithoutSwitching(email, password) {
  const tmp = initializeApp(firebaseConfig, `create-login-${Date.now()}`);
  try {
    const auth = connectAuth(getAuth(tmp));
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await signOut(auth);
    return cred.user.uid;
  } finally {
    await deleteApp(tmp);
  }
}
