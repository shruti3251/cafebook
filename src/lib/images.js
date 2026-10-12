/**
 * Menu photos live in the `menuImages` collection (free Spark plan has no
 * Cloud Storage). A menu item's imageUrl is either a normal https:// link or
 * "fs:<menuImages doc id>".
 */
export const IMAGE_PREFIX = 'fs:';
export const isStoredImage = (src) => typeof src === 'string' && src.startsWith(IMAGE_PREFIX);

const cache = new Map(); // id -> Promise<dataUrl | null>

export function loadStoredImage(src) {
  const id = src.slice(IMAGE_PREFIX.length);
  if (!cache.has(id)) {
    // Menu photos are public, so any app instance can read them.
    // Firebase is imported lazily so pages without photos stay light.
    const p = Promise.all([import('firebase/firestore'), import('./firebase.js')])
      .then(([{ doc, getDoc }, { customerFirebase }]) => getDoc(doc(customerFirebase().db, 'menuImages', id)))
      .then((s) => (s.exists() ? s.data().data : null))
      .catch(() => { cache.delete(id); return null; });
    cache.set(id, p);
  }
  return cache.get(id);
}
