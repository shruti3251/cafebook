import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Live single document. Returns { data, loading, error, exists, fromCache }. */
export function useDocData(db, path) {
  const [state, setState] = useState({ data: null, loading: true, error: null, exists: false, fromCache: false });
  useEffect(() => {
    if (!db || !path) return undefined;
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) => setState({
        data: snap.exists() ? { id: snap.id, ...snap.data() } : null,
        exists: snap.exists(),
        fromCache: snap.metadata.fromCache,
        loading: false,
        error: null,
      }),
      (error) => setState({ data: null, exists: false, fromCache: false, loading: false, error }),
    );
  }, [db, path]);
  return state;
}

/** Live menu (categories + items) for a cafe, sorted by sortOrder. */
export function useMenu(db, cafeId) {
  const [categories, setCategories] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!db || !cafeId) return undefined;
    const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    const u1 = onSnapshot(
      query(collection(db, 'categories'), where('cafeId', '==', cafeId)),
      (s) => setCategories(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(bySort)),
      setError,
    );
    const u2 = onSnapshot(
      query(collection(db, 'menuItems'), where('cafeId', '==', cafeId)),
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(bySort)),
      setError,
    );
    return () => { u1(); u2(); };
  }, [db, cafeId]);

  return { categories: categories || [], items: items || [], loading: categories === null || items === null, error };
}
