// IndexedDB storage for captures, shared by the background script and the
// preview page (same extension origin).
const affrescoStore = (() => {
  const KEEP = 5;
  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('affresco', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('shots');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('shots', mode);
      const req = fn(t.objectStore('shots'));
      t.oncomplete = () => {
        db.close();
        resolve(req?.result);
      };
      t.onerror = t.onabort = () => {
        db.close();
        reject(t.error);
      };
    });
  };
  return {
    get: (id) => tx('readonly', (s) => s.get(id)),
    // Stores a capture under a new time-ordered id and drops the oldest ones.
    async add(shot) {
      const id = Date.now().toString(36).padStart(10, '0') + Math.random().toString(36).slice(2, 6);
      await tx('readwrite', (s) => s.put(shot, id));
      const keys = await tx('readonly', (s) => s.getAllKeys());
      const old = keys.sort().slice(0, Math.max(0, keys.length - KEEP));
      if (old.length) await tx('readwrite', (s) => old.forEach((k) => s.delete(k)));
      return id;
    },
  };
})();
