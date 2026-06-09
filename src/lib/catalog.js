import {
  createCategory,
  createDuplicateCategory,
  createField,
  createItem,
  makeUniqueId,
  normalizeVault,
  safeTag,
  starterCategories,
  textKey,
  titleSimilarity,
  validateItem
} from "./schema.js?v=14";
import { exportVault, loadVault, saveVault } from "./storage.js?v=14";

export async function createCatalog() {
  let vault = await loadVault();
  const subscribers = new Set();

  async function persist(nextVault = vault) {
    vault = await saveVault(nextVault);
    subscribers.forEach((subscriber) => subscriber(getSnapshot()));
    return getSnapshot();
  }

  function getSnapshot() {
    return structuredClone(vault);
  }

  function getActiveCategory() {
    return vault.categories.find((category) => category.id === vault.preferences.activeCategoryId) ?? vault.categories[0];
  }

  return {
    getSnapshot,
    getActiveCategory,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    async setTheme(theme) {
      return persist({
        ...vault,
        preferences: { ...vault.preferences, theme }
      });
    },
    async setView(activeView) {
      return persist({
        ...vault,
        preferences: { ...vault.preferences, activeView }
      });
    },
    async setActiveCategory(categoryId) {
      if (!vault.categories.some((category) => category.id === categoryId)) {
        throw new Error("Categoria non trovata.");
      }

      return persist({
        ...vault,
        preferences: { ...vault.preferences, activeCategoryId: categoryId }
      });
    },
    async addCategory(categoryDraft) {
      const name = String(typeof categoryDraft === "string" ? categoryDraft : categoryDraft?.name || "").trim();
      if (!name) {
        throw new Error("Il nome della categoria e obbligatorio.");
      }
      if (vault.categories.some((category) => textKey(category.name) === textKey(name))) {
        throw new Error("Categoria gia presente.");
      }

      const category = createCategory({
        name,
        tag: typeof categoryDraft === "string" ? name : categoryDraft?.tag
      });
      return persist({
        ...vault,
        preferences: { ...vault.preferences, activeCategoryId: category.id },
        categories: [...vault.categories, category]
      });
    },
    async updateCategory(categoryId, categoryDraft) {
      const target = vault.categories.find((category) => category.id === categoryId);
      if (!target) {
        throw new Error("Categoria non trovata.");
      }

      const name = String(categoryDraft.name || "").trim();
      if (!name) {
        throw new Error("Il nome della categoria e obbligatorio.");
      }

      if (vault.categories.some((category) => category.id !== categoryId && textKey(category.name) === textKey(name))) {
        throw new Error("Categoria gia presente.");
      }

      return persist({
        ...vault,
        categories: vault.categories.map((category) => {
          if (category.id !== categoryId) return category;
          return { ...category, name, tag: safeTag(categoryDraft.tag || name) };
        })
      });
    },
    async addField(categoryId, fieldDraft) {
      const target = vault.categories.find((category) => category.id === categoryId);
      if (!target) {
        throw new Error("Categoria non trovata.");
      }

      const field = createField(fieldDraft);
      if (target.fields.some((candidate) => textKey(candidate.label) === textKey(field.label))) {
        throw new Error("Campo gia presente in questa categoria.");
      }

      const usedFieldIds = new Set(target.fields.map((candidate) => candidate.id));
      const uniqueField = {
        ...field,
        id: makeUniqueId(field.id, usedFieldIds),
        custom: true
      };

      return persist({
        ...vault,
        categories: vault.categories.map((category) => {
          if (category.id !== categoryId) return category;
          return { ...category, fields: [...category.fields, uniqueField] };
        })
      });
    },
    async updateField(categoryId, fieldId, fieldDraft) {
      const target = vault.categories.find((category) => category.id === categoryId);
      if (!target) {
        throw new Error("Categoria non trovata.");
      }

      const existing = target.fields.find((field) => field.id === fieldId);
      if (!existing) {
        throw new Error("Campo non trovato.");
      }

      const label = String(fieldDraft.label || "").trim();
      if (!label) {
        throw new Error("Il nome del campo e obbligatorio.");
      }

      if (target.fields.some((field) => field.id !== fieldId && textKey(field.label) === textKey(label))) {
        throw new Error("Campo gia presente in questa categoria.");
      }

      const updated = { ...existing, label };
      let nextItems = vault.items;

      if (existing.type === "rating") {
        const min = finiteNumber(fieldDraft.min, existing.min ?? 0);
        const max = finiteNumber(fieldDraft.max, existing.max ?? 10);
        const step = finiteNumber(fieldDraft.step, existing.step ?? 0.5);
        if (max <= min) {
          throw new Error("Il valore massimo deve essere maggiore del minimo.");
        }
        if (step <= 0) {
          throw new Error("Lo step deve essere maggiore di zero.");
        }

        updated.min = min;
        updated.max = max;
        updated.step = step;
        nextItems = rescaleRatingValues(vault.items, categoryId, existing, updated);
      }

      return persist({
        ...vault,
        categories: vault.categories.map((category) => {
          if (category.id !== categoryId) return category;
          return {
            ...category,
            fields: category.fields.map((field) => (field.id === fieldId ? updated : field))
          };
        }),
        items: nextItems
      });
    },
    async moveField(categoryId, fieldId, targetIndex) {
      const target = vault.categories.find((category) => category.id === categoryId);
      if (!target) {
        throw new Error("Categoria non trovata.");
      }

      const fromIndex = target.fields.findIndex((field) => field.id === fieldId);
      const toIndex = Math.max(0, Math.min(Number(targetIndex), target.fields.length - 1));
      if (fromIndex === -1 || fromIndex === toIndex) return getSnapshot();

      const fields = [...target.fields];
      const [field] = fields.splice(fromIndex, 1);
      fields.splice(toIndex, 0, field);

      return persist({
        ...vault,
        categories: vault.categories.map((category) => {
          if (category.id !== categoryId) return category;
          return { ...category, fields };
        })
      });
    },
    async removeField(categoryId, fieldId) {
      const target = vault.categories.find((category) => category.id === categoryId);
      if (!target) {
        throw new Error("Categoria non trovata.");
      }
      const field = target.fields.find((candidate) => candidate.id === fieldId);
      if (!field) {
        throw new Error("Campo non trovato.");
      }
      if (!isCustomField(target, field)) {
        throw new Error("Puoi eliminare solo i campi aggiunti.");
      }

      return persist({
        ...vault,
        categories: vault.categories.map((category) => {
          if (category.id !== categoryId) return category;
          return { ...category, fields: category.fields.filter((field) => field.id !== fieldId) };
        }),
        items: vault.items.map((item) => {
          if (item.categoryId !== categoryId) return item;
          const values = { ...item.values };
          delete values[fieldId];
          return { ...item, values, updatedAt: new Date().toISOString() };
        })
      });
    },
    async upsertItem(categoryId, formValues, existingId = null) {
      const item = existingId
        ? updateItem(vault.items.find((candidate) => candidate.id === existingId), categoryId, formValues)
        : createItem(categoryId, formValues);

      validateItem(item);

      return persist({
        ...vault,
        items: existingId
          ? vault.items.map((candidate) => (candidate.id === existingId ? item : candidate))
          : [item, ...vault.items]
      });
    },
    async deleteItem(itemId) {
      return persist({
        ...vault,
        items: vault.items.filter((item) => item.id !== itemId)
      });
    },
    async setItemDone(itemId, done) {
      if (!vault.items.some((item) => item.id === itemId)) {
        throw new Error("Elemento non trovato.");
      }

      return persist({
        ...vault,
        items: vault.items.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            status: done ? "done" : "planned",
            updatedAt: new Date().toISOString()
          };
        })
      });
    },
    async replaceVault(nextVault) {
      vault = normalizeVault(nextVault);
      return persist(vault);
    },
    async exportJson() {
      return exportVault(vault);
    },
    async importJson(jsonText) {
      const incoming = normalizeVault(JSON.parse(jsonText));
      const result = mergeVaults(vault, incoming);
      vault = await saveVault(result.vault);
      subscribers.forEach((subscriber) => subscriber(getSnapshot()));
      return { vault: getSnapshot(), report: result.report };
    }
  };
}

function updateItem(existing, categoryId, formValues) {
  if (!existing) {
    throw new Error("Elemento non trovato.");
  }

  return {
    ...existing,
    categoryId,
    title: String(formValues.title || "").trim(),
    status: formValues.status || "planned",
    updatedAt: new Date().toISOString(),
    values: { ...formValues.values }
  };
}

function mergeVaults(currentVault, incomingVault) {
  const current = normalizeVault(currentVault);
  const incoming = normalizeVault(incomingVault);
  const now = new Date().toISOString();
  const usedCategoryIds = new Set(current.categories.map((category) => category.id));
  const categories = structuredClone(current.categories);
  const items = structuredClone(current.items);
  const categoryMap = new Map();
  const report = {
    categoriesMerged: 0,
    categoriesAdded: 0,
    itemsAdded: 0,
    duplicatesFlagged: 0
  };

  for (const incomingCategory of incoming.categories) {
    const existing = categories.find((category) => textKey(category.name) === textKey(incomingCategory.name));
    if (existing) {
      categoryMap.set(incomingCategory.id, existing.id);
      mergeFields(existing, incomingCategory);
      report.categoriesMerged += 1;
      continue;
    }

    const nextCategory = {
      ...incomingCategory,
      id: makeUniqueId(incomingCategory.id || incomingCategory.name, usedCategoryIds)
    };
    categoryMap.set(incomingCategory.id, nextCategory.id);
    categories.push(nextCategory);
    report.categoriesAdded += 1;
  }

  let duplicateCategory = categories.find((category) => category.id === "duplicates-review");

  for (const incomingItem of incoming.items) {
    const categoryId = categoryMap.get(incomingItem.categoryId);
    if (!categoryId) continue;

    const category = categories.find((candidate) => candidate.id === categoryId);
    const duplicate = items
      .filter((item) => item.categoryId === categoryId)
      .map((item) => ({ item, score: titleSimilarity(item.title, incomingItem.title) }))
      .sort((a, b) => b.score - a.score)[0];

    if (duplicate?.score >= 0.98) {
      if (!duplicateCategory) {
        duplicateCategory = createDuplicateCategory();
        categories.push(duplicateCategory);
      }

      items.unshift({
        id: crypto.randomUUID(),
        categoryId: duplicateCategory.id,
        title: incomingItem.title,
        status: "planned",
        createdAt: now,
        updatedAt: now,
        values: {
          originalCategory: category?.name || categoryId,
          matchedTitle: duplicate.item.title,
          matchScore: Math.round(duplicate.score * 100),
          sourceValues: JSON.stringify(incomingItem.values, null, 2),
          notes: "Import bloccato in revisione: titolo molto simile a una card esistente."
        }
      });
      report.duplicatesFlagged += 1;
      continue;
    }

    items.unshift({
      ...incomingItem,
      id: crypto.randomUUID(),
      categoryId,
      createdAt: incomingItem.createdAt || now,
      updatedAt: now
    });
    report.itemsAdded += 1;
  }

  return {
    report,
    vault: {
      ...current,
      updatedAt: now,
      categories,
      items
    }
  };
}

function mergeFields(targetCategory, sourceCategory) {
  const usedFieldIds = new Set(targetCategory.fields.map((field) => field.id));
  for (const field of sourceCategory.fields) {
    const existing = targetCategory.fields.find((candidate) => textKey(candidate.label) === textKey(field.label));
    if (existing) continue;
    targetCategory.fields.push({
      ...field,
      id: makeUniqueId(field.id || field.label, usedFieldIds)
    });
  }
}

function isCustomField(category, field) {
  if (field.custom) return true;
  const starter = starterCategories.find((candidate) => candidate.id === category.id);
  const builtInIds = new Set((starter?.fields ?? defaultCategoryFields()).map((candidate) => candidate.id));
  return !builtInIds.has(field.id);
}

function defaultCategoryFields() {
  return [
    { id: "rating" },
    { id: "tags" },
    { id: "notes" }
  ];
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rescaleRatingValues(items, categoryId, oldField, newField) {
  const oldMin = finiteNumber(oldField.min, 0);
  const oldMax = finiteNumber(oldField.max, 10);
  const newMin = finiteNumber(newField.min, 0);
  const newMax = finiteNumber(newField.max, 10);
  const oldRange = oldMax - oldMin;
  const newRange = newMax - newMin;
  const step = finiteNumber(newField.step, 0);
  const now = new Date().toISOString();

  return items.map((item) => {
    if (item.categoryId !== categoryId || item.values[oldField.id] === "" || item.values[oldField.id] === undefined) {
      return item;
    }

    const value = Number(item.values[oldField.id]);
    if (!Number.isFinite(value)) return item;

    const ratio = oldRange > 0 ? (value - oldMin) / oldRange : 0;
    const nextValue = snapToStep(newMin + Math.max(0, Math.min(1, ratio)) * newRange, newMin, newMax, step);
    return {
      ...item,
      updatedAt: now,
      values: {
        ...item.values,
        [oldField.id]: nextValue
      }
    };
  });
}

function snapToStep(value, min, max, step) {
  const clamped = Math.max(min, Math.min(max, value));
  if (!step || step <= 0) return Number(clamped.toFixed(4));
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(4));
}
