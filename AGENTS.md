# Remandio Agent API

Remandio stores the entire user archive as one proprietary JSON vault in IndexedDB.
The browser app exposes `window.RemandioAgent` so an AI agent can operate on the app without rewriting UI code.

## Vault Format

```json
{
  "format": "remandio.vault.snapshot",
  "version": 1,
  "preferences": {
    "theme": "system",
    "activeCategoryId": "films"
  },
  "categories": [],
  "items": []
}
```

Categories define the editable fields for cards. Items keep values in `item.values` using the field id.

## Public Methods

```js
await window.RemandioAgent.addCategory("Album");
await window.RemandioAgent.addField("films", {
  label: "Colonna sonora",
  type: "rating",
  min: 0,
  max: 5,
  step: 0.5
});

await window.RemandioAgent.upsertItem("films", {
  title: "Dune: Part Two",
  status: "done",
  values: {
    director: "Denis Villeneuve",
    year: 2024,
    rating: 9,
    tags: ["sci-fi"],
    notes: "Da rivedere."
  }
});
```

`importJson(jsonText)` performs a merge. It does not replace the active vault. Same-name categories are merged, missing fields are added, and items with a title similarity of 98% or higher inside the same category are moved into `Duplicati da rivedere`.

Available methods:

- `getVault()`
- `getActiveCategory()`
- `setActiveCategory(categoryId)`
- `setView(view)`
- `addCategory(name)`
- `addField(categoryId, fieldDraft)`
- `removeField(categoryId, fieldId)`
- `upsertItem(categoryId, formValues, existingId?)`
- `deleteItem(itemId)`
- `exportJson()`
- `importJson(jsonText)`

Field types: `text`, `textarea`, `number`, `rating`, `date`, `tags`.
Status values: `planned`, `in-progress`, `done`.
