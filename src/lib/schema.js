export const FORMAT_ID = "remandio.vault.snapshot";
export const FORMAT_VERSION = 1;

export const FIELD_TYPES = ["text", "textarea", "number", "rating", "date", "tags"];

export const STATUSES = {
  planned: "Da completare",
  done: "Completato"
};

export const starterCategories = [
  {
    id: "films",
    name: "Film",
    kind: "media",
    color: "#8f8a80",
    fields: [
      ratingField("rating", "Valutazione", 0, 10, 0.5),
      textareaField("notes", "Note"),
      textField("director", "Regia"),
      numberField("year", "Anno", 1888, 2100, 1),
      dateField("watchedOn", "Visto il"),
      tagsField("tags", "Tag")
      
    ]
  },
  {
    id: "series",
    name: "Serie TV",
    kind: "media",
    color: "#7f9886",
    fields: [
      ratingField("rating", "Valutazione", 0, 10, 0.5),
      textareaField("notes", "Note"),
      textField("showrunner", "Showrunner"),
      numberField("seasons", "Stagioni viste", 0, 99, 1),
      textField("platform", "Piattaforma"),
      tagsField("tags", "Tag"),
      
    ]
  }
];

export function createEmptyVault() {
  const now = new Date().toISOString();
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    exportedAt: null,
    updatedAt: now,
    preferences: {
      theme: "system",
      activeCategoryId: "films",
      activeView: "library"
    },
    categories: structuredClone(starterCategories),
    items: [
      {
        id: crypto.randomUUID(),
        categoryId: "films",
        title: "Esempio: Her",
        status: "done",
        createdAt: now,
        updatedAt: now,
        values: {
          director: "Spike Jonze",
          year: 2013,
          watchedOn: "",
          rating: 9,
          visuals: 4.5,
          tags: ["sci-fi", "drama"],
          notes: "Una card di esempio. Modifica o elimina liberamente."
        }
      }
    ]
  };
}

export function normalizeVault(input) {
  if (!input || input.format !== FORMAT_ID) {
    throw new Error("Il file non e un vault Remandio valido.");
  }

  const vault = {
    ...input,
    version: FORMAT_VERSION,
    preferences: {
      theme: "system",
      activeCategoryId: "films",
      activeView: "library",
      ...(input.preferences ?? {})
    },
    categories: Array.isArray(input.categories) ? input.categories : [],
    items: Array.isArray(input.items) ? input.items : []
  };

  if (!vault.categories.length) {
    vault.categories = structuredClone(starterCategories);
  }

  vault.categories = vault.categories.map((category) => ({
    id: safeId(category.id || category.name || "category"),
    name: String(category.name || "Senza nome"),
    kind: String(category.kind || "custom"),
    color: category.color || "#8b8c89",
    fields: Array.isArray(category.fields) ? category.fields.map(normalizeField) : []
  }));

  const categoryIds = new Set(vault.categories.map((category) => category.id));
  vault.items = vault.items
    .filter((item) => item && item.title && categoryIds.has(item.categoryId))
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      categoryId: item.categoryId,
      title: String(item.title),
      status: STATUSES[item.status] ? item.status : "planned",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      values: normalizeItemValues(item)
    }));

  vault.updatedAt = new Date().toISOString();
  return vault;
}

function normalizeItemValues(item) {
  const values = item.values && typeof item.values === "object" ? item.values : {};
  if (item.categoryId === "films" && item.title === "Esempio: Her" && !("rating" in values)) {
    return {
      director: "Spike Jonze",
      year: 2013,
      watchedOn: "",
      rating: 9,
      visuals: 4.5,
      tags: ["sci-fi", "drama"],
      notes: "Una card di esempio. Modifica o elimina liberamente."
    };
  }
  return values;
}

export function createCategory(name) {
  const id = uniqueIdFromName(name);
  return {
    id,
    name: titleCase(name),
    kind: "custom",
    color: nextCategoryColor(id),
    fields: [
      ratingField("rating", "Valutazione", 0, 10, 0.5),
      tagsField("tags", "Tag"),
      textareaField("notes", "Note")
    ]
  };
}

export function createField({ label, type, min, max, step }) {
  const safeType = FIELD_TYPES.includes(type) ? type : "text";
  const id = uniqueIdFromName(label);
  const field = {
    id,
    label: titleCase(label),
    type: safeType
  };

  if (safeType === "rating" || safeType === "number") {
    field.min = finiteNumber(min, 0);
    field.max = finiteNumber(max, safeType === "rating" ? 10 : 100);
    field.step = finiteNumber(step, safeType === "rating" ? 0.5 : 1);
  }

  return field;
}

export function createDuplicateCategory() {
  return {
    id: "duplicates-review",
    name: "Duplicati da rivedere",
    kind: "review",
    color: "#d9a441",
    fields: [
      textField("originalCategory", "Categoria originale"),
      textField("matchedTitle", "Possibile duplicato"),
      numberField("matchScore", "Somiglianza", 0, 100, 1),
      textareaField("sourceValues", "Valori importati"),
      textareaField("notes", "Note")
    ]
  };
}

export function createItem(categoryId, formValues) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    categoryId,
    title: String(formValues.title || "").trim(),
    status: formValues.status || "planned",
    createdAt: now,
    updatedAt: now,
    values: { ...formValues.values }
  };
}

export function validateItem(item) {
  if (!item.title || item.title.trim().length < 1) {
    throw new Error("Il titolo e obbligatorio.");
  }

  if (!STATUSES[item.status]) {
    throw new Error("Stato non valido.");
  }
}

export function normalizeField(field) {
  const normalized = createField({
    label: field.label || field.id || "Campo",
    type: field.type,
    min: field.min,
    max: field.max,
    step: field.step
  });
  return {
    ...normalized,
    id: safeId(field.id || normalized.id),
    custom: Boolean(field.custom)
  };
}

export function serializeValue(field, rawValue) {
  if (field.type === "number" || field.type === "rating") {
    if (rawValue === "" || rawValue === null || rawValue === undefined) return "";
    return Number(rawValue);
  }

  if (field.type === "tags") {
    if (Array.isArray(rawValue)) return rawValue;
    return String(rawValue || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return String(rawValue || "").trim();
}

export function displayValue(field, value) {
  if (field.type === "tags") {
    return Array.isArray(value) ? value.join(", ") : "";
  }

  return value ?? "";
}

export function averageRating(category, item) {
  const scores = category.fields
    .filter((field) => field.type === "rating")
    .map((field) => {
      const raw = Number(item.values[field.id]);
      const min = Number(field.min || 0);
      const max = Number(field.max || 10);
      const range = max - min;
      if (!Number.isFinite(raw) || !Number.isFinite(min) || !Number.isFinite(max) || range <= 0) return null;
      return ((raw - min) / range) * 10;
    })
    .filter((score) => score !== null);

  const fallbackScores = scores.length ? scores : fallbackRatingScores(item);
  if (!fallbackScores.length) return null;
  return fallbackScores.reduce((sum, score) => sum + score, 0) / fallbackScores.length;
}

export function textKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function titleSimilarity(left, right) {
  const a = textKey(left);
  const b = textKey(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export function makeUniqueId(baseId, usedIds) {
  let id = safeId(baseId);
  let index = 2;
  while (usedIds.has(id)) {
    id = `${safeId(baseId)}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}

function textField(id, label) {
  return { id, label, type: "text" };
}

function textareaField(id, label) {
  return { id, label, type: "textarea" };
}

function dateField(id, label) {
  return { id, label, type: "date" };
}

function tagsField(id, label) {
  return { id, label, type: "tags" };
}

function numberField(id, label, min, max, step) {
  return { id, label, type: "number", min, max, step };
}

function ratingField(id, label, min, max, step) {
  return { id, label, type: "rating", min, max, step };
}

function uniqueIdFromName(name) {
  return `${safeId(name)}-${crypto.randomUUID().slice(0, 6)}`;
}

function safeId(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nextCategoryColor(seed) {
  const colors = ["#8f8a80", "#7f9886", "#b49468", "#a77c83", "#83888f", "#948769"];
  const index = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + (a[i] === b[j] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function fallbackRatingScores(item) {
  const ratingKey = /(rating|voto|score|visuals|characters|immagine|personaggi|storia|acting|sound|music)/i;
  return Object.entries(item.values || {})
    .filter(([key]) => ratingKey.test(key))
    .map(([, value]) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.min(10, value));
}
