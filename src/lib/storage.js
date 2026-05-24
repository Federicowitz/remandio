import { createEmptyVault, normalizeVault } from "./schema.js?v=11";

const DB_NAME = "remandio-indexeddb";
const DB_VERSION = 1;
const STORE_NAME = "json-vault";
const VAULT_KEY = "active";

let dbPromise;

export async function loadVault() {
  const db = await openDatabase();
  const stored = await readRecord(db, VAULT_KEY);

  if (!stored) {
    const vault = createEmptyVault();
    await saveVault(vault);
    return vault;
  }

  return normalizeVault(stored);
}

export async function saveVault(vault) {
  const db = await openDatabase();
  const snapshot = normalizeVault({
    ...vault,
    updatedAt: new Date().toISOString()
  });

  await writeRecord(db, VAULT_KEY, snapshot);
  return snapshot;
}

export async function exportVault(vault) {
  return JSON.stringify(
    {
      ...normalizeVault(vault),
      exportedAt: new Date().toISOString()
    },
    null,
    2
  );
}

export async function importVault(jsonText) {
  const parsed = JSON.parse(jsonText);
  const vault = normalizeVault(parsed);
  return saveVault(vault);
}

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function readRecord(db, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeRecord(db, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
