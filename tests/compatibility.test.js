import test from "node:test";
import assert from "node:assert/strict";
import { createCatalog } from "../src/lib/catalog.js";
import { normalizeVault } from "../src/lib/schema.js";
import { exportVault } from "../src/lib/storage.js";

// Version 1 archive using the fields and values supported by stable-v0.
export const legacyVault = {
  format: "remandio.vault.snapshot",
  version: 1,
  exportedAt: "2026-10-27T12:00:00.000Z",
  updatedAt: "2026-10-27T12:00:00.000Z",
  preferences: { theme: "dark", activeCategoryId: "albums", activeView: "category", categorySorts: { albums: "rating-desc" } },
  categories: [{
    id: "albums", name: "Album", tag: "note", kind: "media", color: "#b49468",
    fields: [
      { id: "rating", label: "Valutazione", type: "rating", min: 0, max: 10, step: 0.1, custom: false },
      { id: "artist", label: "Artista", type: "text", custom: true },
      { id: "notes", label: "Note", type: "textarea", custom: true },
      { id: "year", label: "Anno", type: "number", min: 1900, max: 2100, step: 1, custom: true },
      { id: "listened-on", label: "Ascoltato il", type: "date", custom: true },
      { id: "tags", label: "Tag", type: "tags", custom: true }
    ]
  }],
  items: [8.7, 0, ""].map((rating, index) => ({
    id: `existing-${index}`, categoryId: "albums", title: `Album ${index + 1}`,
    status: index === 2 ? "planned" : "done",
    createdAt: "2026-06-10T12:00:00.000Z", updatedAt: "2026-10-27T12:00:00.000Z",
    values: { rating, artist: "Björk", notes: "Prima riga\nSeconda riga 🎵", year: 1997, "listened-on": "2026-10-27", tags: ["elettronica", "da riascoltare"], "legacy-extra": "conservare" }
  }))
};

test("opening and saving a version 1 archive preserve all existing records and custom values", async () => {
  let stored = structuredClone(legacyVault);
  let saves = 0;
  const catalog = await createCatalog({
    loadVault: async () => normalizeVault(structuredClone(stored)),
    saveVault: async (vault) => { saves++; stored = normalizeVault(structuredClone(vault)); return structuredClone(stored); },
    exportVault
  });
  assert.equal(saves, 0, "opening the archive must not overwrite the stored record");
  assert.deepEqual(catalog.getSnapshot().items, legacyVault.items);
  assert.deepEqual(catalog.getSnapshot().categories, legacyVault.categories);
  assert.deepEqual(catalog.getSnapshot().preferences, legacyVault.preferences);
  await catalog.setTheme("light");
  assert.equal(saves, 1);
  assert.deepEqual(stored.items, legacyVault.items);
  assert.deepEqual(stored.categories, legacyVault.categories);
  const exported = JSON.parse(await catalog.exportJson());
  assert.equal(exported.version, 1);
  assert.equal(exported.format, legacyVault.format);
  assert.deepEqual(exported.items, legacyVault.items);
});

test("importing a version 1 JSON retains its values and preserves existing records", async () => {
  const initial = structuredClone(legacyVault);
  initial.items = [{ ...initial.items[0], id: "local-only", title: "Existing local record" }];
  const catalog = await createCatalog({
    loadVault: async () => normalizeVault(initial),
    saveVault: async (vault) => normalizeVault(structuredClone(vault)),
    exportVault
  });
  const { report } = await catalog.importJson(JSON.stringify(legacyVault));
  assert.equal(report.itemsAdded, 3);
  const snapshot = catalog.getSnapshot();
  assert.equal(snapshot.items.length, 4);
  assert.deepEqual(snapshot.items.find((item) => item.id === "local-only"), initial.items[0]);
  for (const original of legacyVault.items) {
    const imported = snapshot.items.find((item) => item.title === original.title);
    assert.deepEqual(imported.values, original.values);
    assert.equal(imported.status, original.status);
  }
});
