import test from "node:test";
import assert from "node:assert/strict";
import { createCatalog } from "../src/lib/catalog.js";
import { averageRating, createEmptyVault, normalizeVault } from "../src/lib/schema.js";
import { exportVault } from "../src/lib/storage.js";
import { parseMovieListText } from "../src/lib/import-text.js";

async function fixture(initial = createEmptyVault()) {
  let stored = structuredClone(initial);
  let fail = false;
  const catalog = await createCatalog({
    loadVault: async () => normalizeVault(structuredClone(stored)),
    saveVault: async (vault) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      if (fail) { fail = false; throw new Error("Storage unavailable"); }
      stored = normalizeVault(structuredClone(vault));
      return structuredClone(stored);
    },
    exportVault
  });
  return { catalog, read: () => structuredClone(stored), failNext: () => { fail = true; } };
}

test("export and merge into a fresh archive restore rating settings and preferences", async () => {
  const source = await fixture();
  await source.catalog.updateField("films", "rating", { label: "Valutazione", min: 0, max: 10, step: 0.1 });
  await source.catalog.setTheme("dark");
  await source.catalog.setCategorySort("films", "rating-desc");
  await source.catalog.upsertItem("films", { title: "Decimals", values: { rating: 8.7 } });
  const exported = await source.catalog.exportJson();
  assert.equal(JSON.parse(exported).categories[0].fields[0].step, 0.1);
  const target = await fixture();
  await target.catalog.importJson(exported);
  const restored = target.catalog.getSnapshot();
  assert.equal(restored.categories[0].fields[0].step, 0.1);
  assert.equal(restored.items.find((item) => item.title === "Decimals").values.rating, 8.7);
  assert.equal(restored.preferences.theme, "dark");
  assert.equal(restored.preferences.categorySorts.films, "rating-desc");
  await target.catalog.upsertItem("films", { title: "New decimal", values: { rating: 7.3 } });
  assert.equal(target.read().items.find((item) => item.title === "New decimal").values.rating, 7.3);
});

test("old snapshots without preferences or rating bounds still import", async () => {
  const old = { format: "remandio.vault.snapshot", version: 1,
    categories: [{ id: "films", name: "Film", fields: [{ id: "rating", label: "Valutazione", type: "rating" }] }],
    items: [{ categoryId: "films", title: "Old film", values: { rating: "8,7" } }] };
  const { catalog } = await fixture();
  await catalog.setTheme("dark");
  await catalog.importJson(JSON.stringify(old));
  assert.equal(catalog.getSnapshot().categories[0].fields[0].step, 0.5);
  assert.equal(catalog.getSnapshot().items.find((item) => item.title === "Old film").values.rating, 8.7);
  assert.equal(catalog.getSnapshot().preferences.theme, "dark");
});

test("concurrent JSON imports and edits retain all items", async () => {
  const { catalog } = await fixture();
  const incoming = createEmptyVault();
  incoming.items = [{ categoryId: "films", title: "From JSON", values: { rating: 7.2 } }];
  await Promise.all([
    catalog.importJson(JSON.stringify(incoming)),
    catalog.upsertItem("films", { title: "From editor", values: {} }),
    catalog.setCategorySort("films", "title-asc")
  ]);
  assert.ok(catalog.getSnapshot().items.some((item) => item.title === "From JSON"));
  assert.ok(catalog.getSnapshot().items.some((item) => item.title === "From editor"));
  assert.equal(catalog.getSnapshot().preferences.categorySorts.films, "title-asc");
});

test("failed replace leaves the previously committed vault intact", async () => {
  const { catalog, failNext } = await fixture();
  const original = catalog.getSnapshot();
  const replacement = createEmptyVault();
  replacement.items = [];
  failNext();
  await assert.rejects(catalog.replaceVault(replacement));
  assert.deepEqual(catalog.getSnapshot(), original);
});

test("merge maps same-label fields with different IDs and retains distinct colliding fields", async () => {
  const initial = createEmptyVault();
  initial.categories[0].fields.push({ id: "local-sound", label: "Colonna sonora", type: "text" });
  const incoming = createEmptyVault();
  incoming.categories[0].fields.push({ id: "source-sound", label: "Colonna sonora", type: "text" });
  incoming.categories[0].fields.push({ id: "notes", label: "Altre note", type: "textarea" });
  incoming.items = [{ categoryId: "films", title: "Imported", values: { "source-sound": "Hans Zimmer", notes: "Keep me" } }];
  const { catalog } = await fixture(initial);
  await catalog.importJson(JSON.stringify(incoming));
  const snapshot = catalog.getSnapshot();
  const values = snapshot.items.find((item) => item.title === "Imported").values;
  assert.equal(values["local-sound"], "Hans Zimmer");
  const notes = snapshot.categories[0].fields.find((field) => field.label === "Altre note");
  assert.notEqual(notes.id, "notes");
  assert.equal(values[notes.id], "Keep me");
});

test("concurrent mutations and export see every preceding committed update", async () => {
  const { catalog, read } = await fixture();
  const calls = Array.from({ length: 12 }, (_, i) => catalog.upsertItem("films", { title: `Film ${i}`, values: {} }));
  calls.push(catalog.setTheme("dark"));
  const exported = catalog.exportJson();
  await Promise.all(calls);
  assert.equal(JSON.parse(await exported).items.length, 13);
  assert.equal(read().items.length, 13);
  assert.equal(read().preferences.theme, "dark");
});

test("a failed mutation does not poison the queue or alter the snapshot", async () => {
  const { catalog, failNext } = await fixture();
  failNext();
  await assert.rejects(catalog.upsertItem("films", { title: "Not saved", values: {} }));
  await catalog.upsertItem("films", { title: "Saved", values: {} });
  assert.equal(catalog.getSnapshot().items.some((item) => item.title === "Not saved"), false);
  assert.equal(catalog.getSnapshot().items.some((item) => item.title === "Saved"), true);
});

test("assigning a rating, including zero, marks a card done; empty does not", async () => {
  const { catalog } = await fixture();
  await catalog.upsertItem("films", { title: "Rated zero", status: "planned", values: { rating: 0 } });
  await catalog.upsertItem("films", { title: "Unrated", status: "planned", values: { rating: "" } });
  let snapshot = catalog.getSnapshot();
  assert.equal(snapshot.items.find((item) => item.title === "Rated zero").status, "done");
  const unrated = snapshot.items.find((item) => item.title === "Unrated");
  assert.equal(unrated.status, "planned");
  await catalog.upsertItem("films", { title: unrated.title, status: "planned", values: { rating: 8.1 } }, unrated.id);
  snapshot = catalog.getSnapshot();
  assert.equal(snapshot.items.find((item) => item.id === unrated.id).status, "done");
  await catalog.setItemDone(unrated.id, false);
  assert.equal(catalog.getSnapshot().items.find((item) => item.id === unrated.id).status, "planned");
});

test("rating means ignore blanks and preserve real zeroes", () => {
  const category = { fields: [{ id: "a", type: "rating", min: 0, max: 10 }, { id: "b", type: "rating", min: 0, max: 10 }] };
  assert.equal(averageRating(category, { values: { a: 8, b: "" } }), 8);
  assert.equal(averageRating(category, { values: { a: "", b: null } }), null);
  assert.equal(averageRating(category, { values: { a: 0 } }), 0);
  assert.equal(averageRating({ fields: [{ id: "rating", type: "rating", min: -10, max: 0 }] }, { values: { rating: -5 } }), 5);
});

test("restoring a changed scale rescales existing cards without rounding their precision", async () => {
  const { catalog } = await fixture();
  const incoming = createEmptyVault();
  incoming.categories[0].fields[0].max = 5;
  incoming.categories[0].fields[0].step = 0.1;
  incoming.items = [];
  await catalog.importJson(JSON.stringify(incoming));
  const snapshot = catalog.getSnapshot();
  assert.equal(snapshot.items[0].values.rating, 4.5);
});

test("text import preserves numbered titles and supports explicit integers and legacy decimals", () => {
  const parsed = parseMovieListText("Toy Story 3\nIron Man 2\nOcean's 8\nHer; 9\nDune 8.7\nArrival | 8,5\nFilm\t0");
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.entries.slice(0, 3), [
    { title: "Toy Story 3", rating: null }, { title: "Iron Man 2", rating: null }, { title: "Ocean's 8", rating: null }
  ]);
  assert.deepEqual(parsed.entries.slice(3).map((entry) => entry.rating), [9, 8.7, 8.5, 0]);
  assert.equal(parseMovieListText("Film; 12").errors.length, 1);
});
