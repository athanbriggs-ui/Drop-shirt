// Saved designs live in IndexedDB on this device.
const DB = 'drop-studio', VER = 1;
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const q = indexedDB.open(DB, VER);
    q.onupgradeneeded = () => {
      const d = q.result;
      if (!d.objectStoreNames.contains('designs')) d.createObjectStore('designs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rej(t.error);
  });
};

export const saveDesign = rec => tx('designs', 'readwrite', s => s.put(rec));
export const getDesign = id => tx('designs', 'readonly', s => s.get(id));
export const deleteDesign = id => tx('designs', 'readwrite', s => s.delete(id));
export async function listDesigns() {
  const all = await tx('designs', 'readonly', s => s.getAll());
  return (all || []).map(({ assets, ...rest }) => rest).sort((a, b) => b.updated - a.updated);
}
export const setMeta = (k, v) => tx('meta', 'readwrite', s => s.put(v, k));
export const getMeta = k => tx('meta', 'readonly', s => s.get(k));
