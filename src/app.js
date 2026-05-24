import { createCatalog } from "./lib/catalog.js?v=11";
import { averageRating, displayValue, serializeValue, textKey } from "./lib/schema.js?v=11";

const refs = {
  sideLinks: [...document.querySelectorAll(".side-link[data-view]")],
  categoryNav: document.querySelector("#categoryNav"),
  categoryForm: document.querySelector("#categoryForm"),
  quickAddCategory: document.querySelector("#quickAddCategory"),
  menuToggle: document.querySelector("#menuToggle"),
  themeToggle: document.querySelector("#themeToggle"),
  exportButton: document.querySelector("#exportButton"),
  importFile: document.querySelector("#importFile"),
  searchInput: document.querySelector("#searchInput"),
  newItemButton: document.querySelector("#newItemButton"),
  newCategoryItemButton: document.querySelector("#newCategoryItemButton"),
  editCategoryButton: document.querySelector("#editCategoryButton"),
  backToLibraryButton: document.querySelector("#backToLibraryButton"),
  libraryView: document.querySelector("#libraryView"),
  categoryView: document.querySelector("#categoryView"),
  editorView: document.querySelector("#editorView"),
  libraryGrid: document.querySelector("#libraryGrid"),
  activeCategoryKind: document.querySelector("#activeCategoryKind"),
  activeCategoryTitle: document.querySelector("#activeCategoryTitle"),
  duplicateNotice: document.querySelector("#duplicateNotice"),
  itemForm: document.querySelector("#itemForm"),
  itemList: document.querySelector("#itemList"),
  itemsSummary: document.querySelector("#itemsSummary"),
  entryTitle: document.querySelector("#entryTitle"),
  entryPanel: document.querySelector("#entryPanel"),
  clearFormButton: document.querySelector("#clearFormButton"),
  schemaPanel: document.querySelector("#schemaPanel"),
  schemaFields: document.querySelector("#schemaFields"),
  fieldForm: document.querySelector("#fieldForm")
};

const state = {
  catalog: null,
  vault: null,
  editingId: null,
  formCategoryId: null,
  editorMode: "item"
};

boot();

async function boot() {
  state.catalog = await createCatalog();
  state.vault = state.catalog.getSnapshot();
  state.catalog.subscribe((vault) => {
    state.vault = vault;
    render();
  });

  wireEvents();
  exposeAgentApi();
  registerServiceWorker();
  render();
}

function wireEvents() {
  for (const link of refs.sideLinks) {
    link.addEventListener("click", () => {
      if (link.dataset.view === "editor") {
        openSchemaEditor();
        return;
      }
      closeMobileMenu();
      setView(link.dataset.view);
    });
  }

  refs.menuToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("menu-open");
    refs.menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
  refs.backToLibraryButton.addEventListener("click", () => setView("library"));
  refs.editCategoryButton.addEventListener("click", () => openSchemaEditor());
  refs.searchInput.addEventListener("input", renderCurrentView);

  refs.newItemButton.addEventListener("click", () => openNewItem());
  refs.newCategoryItemButton.addEventListener("click", () => openNewItem());
  refs.clearFormButton.addEventListener("click", () => {
    state.editingId = null;
    state.formCategoryId = activeCategory().id;
    renderForm();
  });

  refs.quickAddCategory.addEventListener("click", async () => {
    const name = prompt("Nome nuova categoria");
    if (!name?.trim()) return;
    await state.catalog.addCategory(name);
    await openSchemaEditor();
  });

  refs.categoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    if (!String(name).trim()) return;
    await state.catalog.addCategory(name);
    state.editingId = null;
    state.formCategoryId = activeCategory().id;
    state.editorMode = "schema";
    event.currentTarget.reset();
  });

  refs.themeToggle.addEventListener("click", async () => {
    const order = ["system", "light", "dark"];
    const current = state.vault.preferences.theme;
    await state.catalog.setTheme(order[(order.indexOf(current) + 1) % order.length]);
  });

  refs.exportButton.addEventListener("click", async () => {
    const json = await state.catalog.exportJson();
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `remandio-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  refs.importFile.addEventListener("change", async (event) => {
    const [file] = event.currentTarget.files;
    if (!file) return;
    try {
      const { report } = await state.catalog.importJson(await file.text());
      state.editingId = null;
      state.formCategoryId = activeCategory().id;
      await setView(report.duplicatesFlagged ? "category" : "library");
      alert(importReportText(report));
    } catch (error) {
      alert(error.message);
    } finally {
      event.currentTarget.value = "";
    }
  });

  refs.fieldForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await state.catalog.addField(activeCategory().id, data);
      event.currentTarget.reset();
      event.currentTarget.elements.min.value = 0;
      event.currentTarget.elements.max.value = 10;
      event.currentTarget.elements.step.value = 0.5;
    } catch (error) {
      alert(error.message);
    }
  });

  refs.itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const categoryId = refs.itemForm.elements.categoryId.value;
    const category = state.vault.categories.find((candidate) => candidate.id === categoryId);
    const formValues = readItemForm(category);

    try {
      await state.catalog.upsertItem(category.id, formValues, state.editingId);
      state.editingId = null;
      state.formCategoryId = category.id;
      await state.catalog.setActiveCategory(category.id);
      await setView("category");
    } catch (error) {
      alert(error.message);
    }
  });
}

function render() {
  applyTheme();
  renderShell();
  renderCurrentView();
  renderEditorMode();
  renderForm();
  renderSchema();
}

function renderShell() {
  const view = activeView();
  refs.libraryView.hidden = view !== "library";
  refs.categoryView.hidden = view !== "category";
  refs.editorView.hidden = view !== "editor";

  for (const link of refs.sideLinks) {
    link.classList.toggle("active", link.dataset.view === view);
  }

  refs.themeToggle.textContent = `Tema: ${themeLabel(state.vault.preferences.theme)}`;
  renderCategories();
}

function renderEditorMode() {
  const editingItem = state.vault.items.find((item) => item.id === state.editingId);
  const itemMode = state.editorMode === "item";
  refs.entryPanel.hidden = !itemMode;
  refs.schemaPanel.hidden = itemMode;
  refs.backToLibraryButton.textContent = itemMode && editingItem ? "Chiudi" : "Libreria";
}

function renderCurrentView() {
  const view = activeView();
  if (view === "library") {
    renderLibrary();
    return;
  }
  if (view === "category") {
    renderCategoryHeader();
    renderItems();
  }
}

function renderCategories() {
  refs.categoryNav.replaceChildren();
  const activeId = activeCategory().id;

  for (const category of state.vault.categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = category.id === activeId ? "category-pill active" : "category-pill";
    button.style.setProperty("--category-color", category.color);
    button.innerHTML = `
      <span class="category-icon">${categoryIcon(category)}</span>
      <span>${escapeHtml(category.name)}</span>
      <strong>${countItems(category.id)}</strong>
    `;
    button.addEventListener("click", async () => {
      state.editingId = null;
      state.formCategoryId = category.id;
      await state.catalog.setActiveCategory(category.id);
      await setView("category");
    });
    refs.categoryNav.append(button);
  }
}

function renderLibrary() {
  const query = searchQuery();
  const categories = state.vault.categories.filter((category) => !query || categoryMatchesQuery(category, query));
  refs.libraryGrid.replaceChildren();

  for (const category of categories) {
    refs.libraryGrid.append(categoryTile(category));
  }

  refs.libraryGrid.append(newCategoryTile());
}

function renderCategoryHeader() {
  const category = activeCategory();
  refs.activeCategoryTitle.textContent = category.name;
  refs.activeCategoryKind.textContent = category.kind === "review" ? "Revisione import" : category.kind === "media" ? "Media" : "Categoria custom";
  refs.itemsSummary.textContent = `${countItems(category.id)} ${countItems(category.id) === 1 ? "elemento" : "elementi"}`;

  const duplicates = category.id === "duplicates-review" ? countItems(category.id) : 0;
  refs.duplicateNotice.hidden = duplicates === 0;
  refs.duplicateNotice.textContent = duplicates
    ? `${duplicates} elementi importati sembrano duplicati. Aprili e decidi se mantenerli, eliminarli o copiarli nella categoria corretta.`
    : "";
}

function renderItems() {
  const category = activeCategory();
  const query = searchQuery();
  const items = state.vault.items
    .filter((item) => item.categoryId === category.id)
    .filter((item) => !query || itemMatchesQuery(item, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  refs.itemList.replaceChildren();
  if (!items.length) {
    refs.itemList.append(document.querySelector("#emptyStateTemplate").content.cloneNode(true));
    return;
  }

  for (const item of items) {
    refs.itemList.append(itemCard(item, category));
  }
}

function renderForm() {
  const editingItem = state.vault.items.find((item) => item.id === state.editingId);
  const category = state.vault.categories.find((candidate) => candidate.id === (state.formCategoryId || editingItem?.categoryId)) ?? activeCategory();
  state.formCategoryId = category.id;
  refs.entryTitle.textContent = editingItem ? "Modifica elemento" : "Aggiungi elemento";
  refs.itemForm.replaceChildren();

  refs.itemForm.append(
    fieldShell("Titolo", inputElement("text", "title", editingItem?.title ?? "", { placeholder: "Titolo" })),
    fieldShell("Categoria", categorySelect(category.id)),
    fieldShell("Completato", doneCheckbox(editingItem?.status === "done"))
  );

  for (const field of category.fields) {
    const value = fieldValueForForm(field, category, editingItem);
    refs.itemForm.append(fieldShell(field.label, controlForField(field, value)));
  }

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary-button full";
  submit.textContent = editingItem ? "Salva modifiche" : "Aggiungi alla lista";
  refs.itemForm.append(submit);
}

function renderSchema() {
  const category = activeCategory();
  refs.schemaFields.replaceChildren();

  for (const field of category.fields) {
    const row = document.createElement("div");
    row.className = "schema-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(field.label)}</strong>
        <span>${escapeHtml(field.type)}${field.type === "rating" ? ` ${field.min}-${field.max}` : ""}</span>
      </div>
    `;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button quiet";
    remove.setAttribute("aria-label", `Rimuovi ${field.label}`);
    remove.textContent = "x";
    remove.addEventListener("click", async () => {
      try {
        await state.catalog.removeField(category.id, field.id);
      } catch (error) {
        alert(error.message);
      }
    });
    row.append(remove);
    refs.schemaFields.append(row);
  }
}

function categoryTile(category) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "library-tile";
  button.style.setProperty("--category-color", category.color);
  button.innerHTML = `
    <span class="tile-icon">${categoryIcon(category)}</span>
    <strong>${escapeHtml(category.name)}</strong>
    <span>${countItems(category.id)} ${countItems(category.id) === 1 ? "elemento" : "elementi"}</span>
  `;
  button.addEventListener("click", async () => {
    await state.catalog.setActiveCategory(category.id);
    await setView("category");
  });
  return button;
}

function newCategoryTile() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "library-tile new-tile";
  button.innerHTML = `
    <span class="tile-icon">+</span>
    <strong>Nuova categoria</strong>
    <span>Personalizza la tua libreria</span>
  `;
  button.addEventListener("click", async () => {
    await openSchemaEditor();
    document.querySelector("#categoryName")?.focus();
  });
  return button;
}

function itemCard(item, category) {
  const article = document.createElement("article");
  const score = averageRating(category, item);
  article.className = "memory-card";
  article.classList.toggle("is-done", item.status === "done");
  article.style.setProperty("--category-color", category.color);

  const detailsId = `details-${item.id}`;
  const metaFields = category.fields.filter((field) => item.values[field.id] !== "" && item.values[field.id] !== undefined);

  article.innerHTML = `
    <button type="button" class="card-summary" aria-expanded="false" aria-controls="${detailsId}">
      <span>
        <span class="status-badge" aria-label="${item.status === "done" ? "Completato" : "Da completare"}">${item.status === "done" ? "✓" : ""}</span>
        <strong>${escapeHtml(item.title)}</strong>
      </span>
      <span class="score-pill">${score === null ? "-" : formatScore(score)}/10</span>
    </button>
    <div id="${detailsId}" class="card-details" hidden>
      <dl class="meta-list">
        ${metaFields.map((field) => detailRow(field, item.values[field.id])).join("")}
      </dl>
      <div class="card-actions"></div>
    </div>
  `;

  const summary = article.querySelector(".card-summary");
  const details = article.querySelector(".card-details");
  summary.addEventListener("click", () => {
    if (Number(article.dataset.swipedUntil || 0) > Date.now()) return;
    const open = details.hidden;
    details.hidden = !open;
    summary.setAttribute("aria-expanded", String(open));
  });
  attachSwipeStatus(article, item);

  const actions = article.querySelector(".card-actions");
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "ghost-button compact";
  edit.textContent = "Modifica";
  edit.addEventListener("click", () => {
    state.editingId = item.id;
    state.formCategoryId = item.categoryId;
    openItemEditor();
    refs.entryPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost-button compact danger";
  remove.textContent = "Elimina";
  remove.addEventListener("click", async () => {
    if (remove.dataset.confirm === "true") {
      await state.catalog.deleteItem(item.id);
      return;
    }
    remove.dataset.confirm = "true";
    remove.textContent = "Conferma";
    setTimeout(() => {
      remove.dataset.confirm = "false";
      remove.textContent = "Elimina";
    }, 2500);
  });

  actions.append(edit, remove);
  return article;
}

function attachSwipeStatus(article, item) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  article.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
  });

  article.addEventListener("pointerup", async (event) => {
    if (!tracking) return;
    tracking = false;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;

    article.dataset.swipedUntil = String(Date.now() + 450);
    await state.catalog.setItemDone(item.id, deltaX > 0);
  });

  article.addEventListener("pointercancel", () => {
    tracking = false;
  });
}

function detailRow(field, value) {
  const shown = field.type === "rating" && Number(value) <= 0 ? "" : displayValue(field, value);
  if (shown === "" || shown === undefined) return "";
  return `<div class="${isWideField(field) ? "meta-wide" : ""}"><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(shown)}</dd></div>`;
}

function isWideField(field) {
  return field.type === "textarea" || textKey(field.id).includes("notes") || textKey(field.label).includes("note");
}

function fieldShell(label, control) {
  const wrapper = document.createElement("label");
  wrapper.append(label, control);
  return wrapper;
}

function inputElement(type, name, value, attrs = {}) {
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.value = value ?? "";
  Object.entries(attrs).forEach(([key, attrValue]) => input.setAttribute(key, attrValue));
  return input;
}

function categorySelect(selectedId) {
  const select = document.createElement("select");
  select.name = "categoryId";
  for (const category of state.vault.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === selectedId;
    select.append(option);
  }
  select.addEventListener("change", () => {
    state.formCategoryId = select.value;
    renderForm();
  });
  return select;
}

function fieldValueForForm(field, targetCategory, editingItem) {
  if (!editingItem) return "";
  if (editingItem.categoryId === targetCategory.id) {
    return editingItem.values[field.id] ?? "";
  }

  if (field.id in editingItem.values) {
    return editingItem.values[field.id];
  }

  const sourceCategory = state.vault.categories.find((category) => category.id === editingItem.categoryId);
  const sourceField = sourceCategory?.fields.find((candidate) => textKey(candidate.label) === textKey(field.label));
  return sourceField ? editingItem.values[sourceField.id] ?? "" : "";
}

function doneCheckbox(checked) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "isDone";
  input.checked = checked;
  return input;
}

function controlForField(field, value) {
  if (field.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.name = field.id;
    textarea.rows = 4;
    textarea.value = displayValue(field, value);
    return textarea;
  }

  if (field.type === "rating") {
    const group = document.createElement("div");
    group.className = "rating-control";
    const range = inputElement("range", field.id, value === "" || value === undefined ? field.min : value, {
      min: field.min,
      max: field.max,
      step: field.step
    });
    const output = document.createElement("output");
    output.textContent = range.value;
    range.addEventListener("input", () => {
      output.textContent = range.value;
    });
    group.append(range, output);
    return group;
  }

  if (field.type === "number") {
    return inputElement("number", field.id, displayValue(field, value), {
      min: field.min,
      max: field.max,
      step: field.step
    });
  }

  if (field.type === "date") return inputElement("date", field.id, displayValue(field, value));

  return inputElement("text", field.id, displayValue(field, value), {
    placeholder: field.type === "tags" ? "thriller, preferiti, 2026" : field.label
  });
}

function readItemForm(category) {
  const data = new FormData(refs.itemForm);
  const values = {};
  for (const field of category.fields) {
    values[field.id] = serializeValue(field, data.get(field.id));
  }

  return {
    title: data.get("title"),
    status: data.get("isDone") === "on" ? "done" : "planned",
    values
  };
}

async function setView(view) {
  closeMobileMenu();
  await state.catalog.setView(view);
}

async function openItemEditor() {
  state.editorMode = "item";
  state.formCategoryId = activeCategory().id;
  await setView("editor");
}

async function openSchemaEditor() {
  state.editingId = null;
  state.formCategoryId = activeCategory().id;
  state.editorMode = "schema";
  await setView("editor");
}

async function openNewItem() {
  state.editingId = null;
  state.formCategoryId = activeCategory().id;
  await openItemEditor();
}

function closeMobileMenu() {
  document.body.classList.remove("menu-open");
  refs.menuToggle.setAttribute("aria-expanded", "false");
}

function activeView() {
  return state.vault.preferences.activeView || "library";
}

function activeCategory() {
  return state.catalog.getActiveCategory();
}

function countItems(categoryId) {
  return state.vault.items.filter((item) => item.categoryId === categoryId).length;
}

function itemMatchesQuery(item, query) {
  return [item.title, item.status, ...Object.values(item.values).flat()]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function categoryMatchesQuery(category, query) {
  if (category.name.toLowerCase().includes(query)) return true;
  return state.vault.items.some((item) => item.categoryId === category.id && itemMatchesQuery(item, query));
}

function searchQuery() {
  return refs.searchInput.value.trim().toLowerCase();
}

function formatScore(score) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(score);
}

function themeLabel(theme) {
  if (theme === "dark") return "Scuro";
  if (theme === "light") return "Chiaro";
  return "Auto";
}

function categoryIcon(category) {
  const name = category?.name?.toLowerCase() || "";
  if (name.includes("serie")) return "tv";
  if (name.includes("lib")) return "book";
  if (name.includes("album")) return "note";
  if (name.includes("live")) return "mic";
  if (name.includes("luog") || name.includes("posti")) return "pin";
  if (name.includes("duplic")) return "!";
  return "film";
}

function importReportText(report) {
  return [
    "Import completato in merge.",
    `${report.categoriesMerged} categorie unite.`,
    `${report.categoriesAdded} categorie aggiunte.`,
    `${report.itemsAdded} card aggiunte.`,
    `${report.duplicatesFlagged} possibili duplicati spostati in revisione.`
  ].join("\n");
}

function applyTheme() {
  document.documentElement.dataset.theme = state.vault.preferences.theme;
}

function exposeAgentApi() {
  window.RemandioAgent = {
    getVault: () => state.catalog.getSnapshot(),
    getActiveCategory: () => state.catalog.getActiveCategory(),
    setActiveCategory: (categoryId) => state.catalog.setActiveCategory(categoryId),
    setView: (view) => state.catalog.setView(view),
    addCategory: (name) => state.catalog.addCategory(name),
    addField: (categoryId, fieldDraft) => state.catalog.addField(categoryId, fieldDraft),
    removeField: (categoryId, fieldId) => state.catalog.removeField(categoryId, fieldId),
    upsertItem: (categoryId, formValues, existingId) => state.catalog.upsertItem(categoryId, formValues, existingId),
    setItemDone: (itemId, done) => state.catalog.setItemDone(itemId, done),
    deleteItem: (itemId) => state.catalog.deleteItem(itemId),
    exportJson: () => state.catalog.exportJson(),
    importJson: (jsonText) => state.catalog.importJson(jsonText)
  };
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Service workers require http(s); the app still works as a static local file.
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
