import { createCatalog } from "./lib/catalog.js?v=15";
import { averageRating, displayValue, serializeValue, textKey } from "./lib/schema.js?v=14";

const refs = {
  sideLinks: [...document.querySelectorAll(".side-link[data-view]")],
  categoryNav: document.querySelector("#categoryNav"),
  categoryForm: document.querySelector("#categoryForm"),
  quickAddCategory: document.querySelector("#quickAddCategory"),
  menuToggle: document.querySelector("#menuToggle"),
  menuScrim: document.querySelector("#menuScrim"),
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
  itemHeaderSubmitButton: document.querySelector("#itemHeaderSubmitButton"),
  schemaPanel: document.querySelector("#schemaPanel"),
  categoryNameForm: document.querySelector("#categoryNameForm"),
  editCategoryName: document.querySelector("#editCategoryName"),
  editCategoryTag: document.querySelector("#editCategoryTag"),
  schemaFields: document.querySelector("#schemaFields"),
  fieldDetail: document.querySelector("#fieldDetail"),
  fieldForm: document.querySelector("#fieldForm")
};

const state = {
  catalog: null,
  vault: null,
  editingId: null,
  formCategoryId: null,
  editorMode: "item",
  schemaCanCreateCategory: false,
  editingFieldId: null,
  draggingFieldId: null,
  suppressFieldClick: false
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
      closeMobileMenu();
      setView(link.dataset.view);
    });
  }

  refs.menuToggle.addEventListener("click", () => {
    setMobileMenuOpen(!document.body.classList.contains("menu-open"));
  });
  refs.menuScrim.addEventListener("click", closeMobileMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });
  document.querySelector(".sidebar").addEventListener("click", (event) => {
    if (event.target.closest("#menuToggle")) return;
    if (event.target.closest("button, .file-trigger")) closeMobileMenu();
  });
  refs.backToLibraryButton.addEventListener("click", () => setView("library"));
  refs.editCategoryButton.addEventListener("click", () => openSchemaEditor({ canCreateCategory: false }));
  refs.searchInput.addEventListener("input", renderCurrentView);

  refs.newItemButton.addEventListener("click", () => openNewItem());
  refs.newCategoryItemButton.addEventListener("click", () => openNewItem());

  refs.quickAddCategory.addEventListener("click", async () => {
    await openSchemaEditor({ canCreateCategory: true });
    document.querySelector("#categoryName")?.focus();
  });

  refs.categoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (!String(data.name).trim()) return;
    try {
      await state.catalog.addCategory(data);
      state.editingId = null;
      state.formCategoryId = activeCategory().id;
      state.editorMode = "schema";
      state.editingFieldId = null;
      form.reset();
    } catch (error) {
      alert(error.message);
    }
  });

  refs.categoryNameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await state.catalog.updateCategory(activeCategory().id, data);
    } catch (error) {
      alert(error.message);
    }
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
      state.editingFieldId = null;
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
  refs.itemHeaderSubmitButton.textContent = editingItem ? "Salva" : "Aggiungi";
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

  const actions = document.createElement("div");
  actions.className = "form-actions";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "ghost-button full";
  clear.textContent = "Pulisci";
  clear.addEventListener("click", () => {
    state.editingId = null;
    state.formCategoryId = activeCategory().id;
    renderForm();
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary-button full";
  submit.textContent = editingItem ? "Salva modifiche" : "Aggiungi alla lista";
  actions.append(clear, submit);
  refs.itemForm.append(actions);
}

function renderSchema() {
  const category = activeCategory();
  const editingField = category.fields.find((field) => field.id === state.editingFieldId);
  const detailMode = Boolean(editingField);
  refs.editCategoryName.value = category.name;
  refs.editCategoryTag.value = categoryIcon(category);
  refs.categoryNameForm.hidden = detailMode || state.schemaCanCreateCategory;
  refs.categoryForm.hidden = detailMode || !state.schemaCanCreateCategory;
  refs.schemaFields.hidden = detailMode;
  refs.fieldForm.hidden = detailMode;
  refs.fieldDetail.hidden = !detailMode;
  refs.schemaFields.replaceChildren();
  refs.fieldDetail.replaceChildren();

  if (detailMode) {
    renderFieldDetail(category, editingField);
    return;
  }

  category.fields.forEach((field, index) => {
    const row = document.createElement("div");
    row.className = "schema-row";
    row.dataset.fieldId = field.id;
    row.dataset.index = String(index);
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(field.label)}</strong>
        <span>${fieldTypeLabel(field)}${field.type === "rating" ? ` ${formatScore(field.min)}-${formatScore(field.max)}` : ""}</span>
      </div>
      <span class="drag-handle" aria-hidden="true">=</span>
    `;
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.addEventListener("click", () => {
      if (state.suppressFieldClick) return;
      state.editingFieldId = field.id;
      renderSchema();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      state.editingFieldId = field.id;
      renderSchema();
    });
    attachFieldDrag(row, category, field);
    refs.schemaFields.append(row);
  });
}

function renderFieldDetail(category, field) {
  const canDelete = isCustomField(category, field);
  const form = document.createElement("form");
  form.className = "stacked-form small-form";
  form.innerHTML = `
    <div class="panel-heading field-detail-heading">
      <div>
        <p class="eyebrow">${fieldTypeLabel(field)}</p>
        <h3>${escapeHtml(field.label)}</h3>
      </div>
      <button type="button" class="ghost-button compact" data-action="back">Campi</button>
    </div>
    <label>
      Nome campo
      <input name="label" type="text" value="${escapeHtml(field.label)}" required />
    </label>
    <label>
      Tipo
      <input type="text" value="${fieldTypeLabel(field)}" disabled />
    </label>
    ${field.type === "rating" ? ratingSettingsMarkup(field) : ""}
    <button type="submit" class="primary-button full">Salva campo</button>
    ${canDelete ? '<button type="button" class="ghost-button danger full" data-action="delete">Elimina campo</button>' : ""}
  `;

  form.querySelector('[data-action="back"]').addEventListener("click", () => {
    state.editingFieldId = null;
    renderSchema();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await state.catalog.updateField(category.id, field.id, data);
      state.editingFieldId = field.id;
    } catch (error) {
      alert(error.message);
    }
  });

  const deleteButton = form.querySelector('[data-action="delete"]');
  deleteButton?.addEventListener("click", async () => {
    if (deleteButton.dataset.confirm === "true") {
      try {
        await state.catalog.removeField(category.id, field.id);
        state.editingFieldId = null;
      } catch (error) {
        alert(error.message);
      }
      return;
    }
    deleteButton.dataset.confirm = "true";
    deleteButton.textContent = "Conferma eliminazione";
    setTimeout(() => {
      deleteButton.dataset.confirm = "false";
      deleteButton.textContent = "Elimina campo";
    }, 2500);
  });

  refs.fieldDetail.append(form);
}

function ratingSettingsMarkup(field) {
  return `
    <div class="range-row">
      <label>
        Min
        <input name="min" type="number" value="${escapeHtml(field.min ?? 0)}" step="0.1" />
      </label>
      <label>
        Max
        <input name="max" type="number" value="${escapeHtml(field.max ?? 10)}" step="0.1" />
      </label>
      <label>
        Step
        <input name="step" type="number" value="${escapeHtml(field.step ?? 0.5)}" step="0.1" />
      </label>
    </div>
  `;
}

function attachFieldDrag(row, category, field) {
  let holdTimer = null;
  row.draggable = false;

  row.addEventListener("pointerdown", () => {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      row.draggable = true;
      row.classList.add("ready-to-drag");
    }, 220);
  });

  for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
    row.addEventListener(eventName, () => {
      clearTimeout(holdTimer);
      if (!state.draggingFieldId) {
        row.draggable = false;
        row.classList.remove("ready-to-drag");
      }
    });
  }

  row.addEventListener("dragstart", (event) => {
    if (!row.draggable) {
      event.preventDefault();
      return;
    }
    state.draggingFieldId = field.id;
    state.suppressFieldClick = true;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", field.id);
  });

  row.addEventListener("dragover", (event) => {
    if (!state.draggingFieldId || state.draggingFieldId === field.id) return;
    event.preventDefault();
    row.classList.add("drop-target");
  });

  row.addEventListener("dragleave", () => row.classList.remove("drop-target"));

  row.addEventListener("drop", async (event) => {
    event.preventDefault();
    row.classList.remove("drop-target");
    const draggedId = event.dataTransfer.getData("text/plain") || state.draggingFieldId;
    if (!draggedId || draggedId === field.id) return;
    try {
      await state.catalog.moveField(category.id, draggedId, Number(row.dataset.index));
    } catch (error) {
      alert(error.message);
    }
  });

  row.addEventListener("dragend", () => {
    row.draggable = false;
    row.classList.remove("ready-to-drag", "dragging");
    state.draggingFieldId = null;
    setTimeout(() => {
      state.suppressFieldClick = false;
    }, 0);
  });
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
    state.editingFieldId = null;
    await state.catalog.setActiveCategory(category.id);
    await setView("category");
  });
  return button;
}

function itemCard(item, category) {
  const article = document.createElement("article");
  const score = averageRating(category, item);
  const scoreLabel = score === null ? "-" : formatScore(score);
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
      <span class="score-pill" style="${scoreBadgeStyle(score)}" aria-label="${score === null ? "Nessun voto" : `Voto ${scoreLabel} su 10`}">${scoreLabel}</span>
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

function scoreBadgeStyle(score) {
  if (score === null) {
    return "--score-border: rgba(255, 255, 255, 0.15); --score-text: rgba(255, 255, 255, 0.68);";
  }

  const normalized = Math.max(0, Math.min(10, Number(score)));
  const progress = Math.max(0, (normalized - 6) / 4);
  const color =
    normalized <= 6
      ? "rgba(255, 255, 255, 0.18)"
      : `color-mix(in srgb, rgba(255, 255, 255, 0.24), hsl(270 84% 68%) ${Math.round(progress * 100)}%)`;

  return `--score-border: ${color}; --score-text: rgba(255, 255, 255, ${normalized > 6 ? "0.90" : "0.68"});`;
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
  state.schemaCanCreateCategory = false;
  state.editingFieldId = null;
  state.formCategoryId = activeCategory().id;
  await setView("editor");
}

async function openSchemaEditor({ canCreateCategory = false } = {}) {
  state.editingId = null;
  state.formCategoryId = activeCategory().id;
  state.editorMode = "schema";
  state.schemaCanCreateCategory = canCreateCategory;
  state.editingFieldId = null;
  await setView("editor");
}

async function openNewItem() {
  state.editingId = null;
  state.formCategoryId = activeCategory().id;
  await openItemEditor();
}

function closeMobileMenu() {
  setMobileMenuOpen(false);
}

function setMobileMenuOpen(isOpen) {
  document.body.classList.toggle("menu-open", isOpen);
  refs.menuToggle.setAttribute("aria-expanded", String(isOpen));
  refs.menuScrim.hidden = !isOpen;
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

function fieldTypeLabel(field) {
  const labels = {
    text: "Testo",
    textarea: "Note lunghe",
    number: "Numero",
    rating: "Voto",
    date: "Data",
    tags: "Tag"
  };
  return labels[field.type] || field.type;
}

function isCustomField(category, field) {
  if (field.custom) return true;
  const builtInByCategory = {
    films: ["rating", "notes", "director", "year", "watchedOn", "tags"],
    series: ["rating", "notes", "showrunner", "seasons", "platform", "tags"]
  };
  const defaultIds = builtInByCategory[category.id] || ["rating", "tags", "notes"];
  return !defaultIds.includes(field.id);
}

function themeLabel(theme) {
  if (theme === "dark") return "Scuro";
  if (theme === "light") return "Chiaro";
  return "Auto";
}

function categoryIcon(category) {
  if (category?.tag) return category.tag;
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
    updateCategory: (categoryId, categoryDraft) => state.catalog.updateCategory(categoryId, categoryDraft),
    addField: (categoryId, fieldDraft) => state.catalog.addField(categoryId, fieldDraft),
    updateField: (categoryId, fieldId, fieldDraft) => state.catalog.updateField(categoryId, fieldId, fieldDraft),
    moveField: (categoryId, fieldId, targetIndex) => state.catalog.moveField(categoryId, fieldId, targetIndex),
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
