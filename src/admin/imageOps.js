import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { IMAGE_PREFIX, isStoredImage } from '../lib/images.js';

/** Shrinks a photo and returns it as a data URL (webp, or jpeg on old Safari). */
export function compressImage(file, maxSize = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // transparent PNGs -> white instead of black in JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/webp', quality);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', quality);
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unsupported image')); };
    img.src = url;
  });
}

export async function saveMenuImage(db, cafeId, file) {
  const data = await compressImage(file);
  if (data.length > 850000) throw new Error('This photo is too large even after compressing. Please try another one.');
  const ref = await addDoc(collection(db, 'menuImages'), { cafeId, data });
  return IMAGE_PREFIX + ref.id;
}

export async function deleteMenuImage(db, src) {
  if (!isStoredImage(src)) return;
  await deleteDoc(doc(db, 'menuImages', src.slice(IMAGE_PREFIX.length))).catch(() => {});
}
