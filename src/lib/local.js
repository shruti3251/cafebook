// Safe localStorage helpers: private mode / blocked storage never crash the app.
export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const keys = {
  profile: (cafeId) => `cafebook:profile:${cafeId}`,
  cart: (cafeId, table) => `cafebook:cart:${cafeId}:${table}`,
  pending: (cafeId, table) => `cafebook:pending:${cafeId}:${table}`,
  token: (cafeId, table) => `cafebook:token:${cafeId}:${table}`,
  sound: 'cafebook:admin:sound',
};
