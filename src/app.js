import { createCatalog } from "./lib/catalog.js?v=22";
import { averageRating, createCategory, createField, displayValue, makeUniqueId, serializeValue, textKey } from "./lib/schema.js?v=17";

const refs = {
  sideLinks: [...document.querySelectorAll(".side-link[data-view]")],
  categoryNav: document.querySelector("#categoryNav"),
  categoryForm: document.querySelector("#categoryForm"),
  quickAddCategory: document.querySelector("#quickAddCategory"),
  menuToggle: document.querySelector("#menuToggle"),
  menuScrim: document.querySelector("#menuScrim"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsClose: document.querySelector("#settingsClose"),
  themeToggle: document.querySelector("#themeToggle"),
  exportButton: document.querySelector("#exportButton"),
  importFile: document.querySelector("#importFile"),
  movieListImportButton: document.querySelector("#movieListImportButton"),
  movieListImportDialog: document.querySelector("#movieListImportDialog"),
  movieListImportForm: document.querySelector("#movieListImportForm"),
  movieListImportClose: document.querySelector("#movieListImportClose"),
  movieListImportCancel: document.querySelector("#movieListImportCancel"),
  movieListCategory: document.querySelector("#movieListCategory"),
  movieListText: document.querySelector("#movieListText"),
  movieListPreview: document.querySelector("#movieListPreview"),
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
  itemSortToolbar: document.querySelector("#itemSortToolbar"),
  itemForm: document.querySelector("#itemForm"),
  itemList: document.querySelector("#itemList"),
  itemsSummary: document.querySelector("#itemsSummary"),
  entryTitle: document.querySelector("#entryTitle"),
  entryPanel: document.querySelector("#entryPanel"),
  itemHeaderSubmitButton: document.querySelector("#itemHeaderSubmitButton"),
  schemaPanel: document.querySelector("#schemaPanel"),
  categoryNameForm: document.querySelector("#categoryNameForm"),
  deleteCategoryButton: document.querySelector("#deleteCategoryButton"),
  editCategoryName: document.querySelector("#editCategoryName"),
  editCategoryTag: document.querySelector("#editCategoryTag"),
  editCategoryKind: document.querySelector("#editCategoryKind"),
  categoryKind: document.querySelector("#categoryKind"),
  categoryKindPickers: [...document.querySelectorAll("[data-kind-picker]")],
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
  draftCategory: null,
  editingFieldId: null,
  draggingFieldId: null,
  suppressFieldClick: false,
  pendingScrollItemId: null
};

const titleCollator = new Intl.Collator("it-IT", { sensitivity: "base", numeric: true });

boot();

async function boot() {
  mountSettingsPanelOverlay();
  mountMovieListImportDialog();
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

function mountSettingsPanelOverlay() {
  if (refs.settingsPanel.parentElement === document.body) return;
  document.body.append(refs.settingsPanel);
}

function mountMovieListImportDialog() {
  if (!refs.movieListImportDialog) {
    const dialog = document.createElement("dialog");
    dialog.id = "movieListImportDialog";
    dialog.className = "modal-dialog";
    dialog.setAttribute("aria-labelledby", "movieListImportTitle");
    dialog.innerHTML = movieListImportDialogMarkup();
    document.body.append(dialog);
  }

  refs.movieListImportDialog = document.querySelector("#movieListImportDialog");
  refs.movieListImportForm = document.querySelector("#movieListImportForm");
  refs.movieListImportClose = document.querySelector("#movieListImportClose");
  refs.movieListImportCancel = document.querySelector("#movieListImportCancel");
  refs.movieListCategory = document.querySelector("#movieListCategory");
  refs.movieListText = document.querySelector("#movieListText");
  refs.movieListPreview = document.querySelector("#movieListPreview");
}

function movieListImportDialogMarkup() {
  return `
    <form id="movieListImportForm" class="stacked-form movie-import-form" method="dialog">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Import elementi</p>
          <h2 id="movieListImportTitle">Importa da lista testuale</h2>
        </div>
        <button type="button" id="movieListImportClose" class="icon-button quiet" aria-label="Chiudi">x</button>
      </div>
      <label>
        Lista di destinazione
        <select id="movieListCategory" name="categoryId"></select>
      </label>
      <label>
        Testo da importare
        <textarea
          id="movieListText"
          name="movieListText"
          rows="10"
          placeholder="Ocean's 11 5.6&#10;Her&#10;Qualcuno volo sul nido del cuculo 8.7"
          required
        ></textarea>
      </label>
      <p id="movieListPreview" class="import-preview" aria-live="polite"></p>
      <div class="form-actions">
        <button type="button" id="movieListImportCancel" class="ghost-button full">Annulla</button>
        <button type="submit" class="primary-button full">Importa</button>
      </div>
    </form>
  `;
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
    if (event.key === "Escape") {
      closeCategoryKindMenus();
      closeSettingsPanel();
      closeMobileMenu();
    }
  });
  document.querySelector(".sidebar").addEventListener("click", (event) => {
    if (event.target.closest("#menuToggle")) return;
    if (event.target.closest("#settingsToggle, #settingsPanel")) return;
    if (event.target.closest("button, .file-trigger")) closeMobileMenu();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-kind-picker]")) closeCategoryKindMenus();
    if (refs.settingsPanel.hidden) return;
    if (event.target.closest("#settingsToggle, #settingsPanel")) return;
    closeSettingsPanel();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-kind-trigger]");
    if (trigger) {
      toggleCategoryKindMenu(trigger.closest("[data-kind-picker]"));
      return;
    }

    const option = event.target.closest("[data-kind-option]");
    if (option) {
      setCategoryKindValue(option.closest("[data-kind-picker]"), option.dataset.kind);
    }
  });
  document.addEventListener("input", (event) => {
    if (!event.target.matches("[data-kind-new]")) return;
    const value = event.target.value.trim();
    if (value) setCategoryKindValue(event.target.closest("[data-kind-picker]"), value, { keepNewInput: true });
  });
  refs.settingsToggle.addEventListener("click", () => {
    toggleSettingsPanel(refs.settingsPanel.hidden);
  });
  refs.settingsClose.addEventListener("click", closeSettingsPanel);
  refs.backToLibraryButton.addEventListener("click", closeEditor);
  refs.editCategoryButton.addEventListener("click", () => openSchemaEditor({ canCreateCategory: false }));
  refs.searchInput.addEventListener("input", renderCurrentView);
  refs.itemSortToolbar.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-sort-group]");
    if (!button) return;
    await state.catalog.setCategorySort(activeCategory().id, nextSortMode(activeCategorySort(activeCategory().id), button.dataset.sortGroup));
  });

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
      await state.catalog.addCategory({
        ...data,
        fields: state.draftCategory?.fields
      });
      state.editingId = null;
      state.formCategoryId = activeCategory().id;
      state.editorMode = "schema";
      state.schemaCanCreateCategory = false;
      state.draftCategory = null;
      state.editingFieldId = null;
      form.reset();
      render();
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

  refs.deleteCategoryButton.addEventListener("click", async () => {
    const category = activeCategory();
    const confirmed = confirmIrreversibleDelete(`Eliminare la categoria "${category.name}" e tutte le sue card?`);
    if (!confirmed) return;
    try {
      state.editingId = null;
      state.formCategoryId = null;
      state.editingFieldId = null;
      await state.catalog.deleteCategory(category.id);
      await setView("library");
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

  refs.movieListImportButton.addEventListener("click", openMovieListImportDialog);
  refs.movieListImportClose.addEventListener("click", () => refs.movieListImportDialog.close());
  refs.movieListImportCancel.addEventListener("click", () => refs.movieListImportDialog.close());
  refs.movieListText.addEventListener("input", renderMovieListImportPreview);
  refs.movieListImportForm.addEventListener("submit", submitMovieListImport);

  refs.fieldForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (state.schemaCanCreateCategory) {
        addDraftField(data);
        event.currentTarget.reset();
        event.currentTarget.elements.min.value = 0;
        event.currentTarget.elements.max.value = 10;
        event.currentTarget.elements.step.value = 0.5;
        renderSchema();
        return;
      }
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
    const editedItemId = state.editingId;

    try {
      await state.catalog.upsertItem(category.id, formValues, state.editingId);
      state.editingId = null;
      state.formCategoryId = category.id;
      state.pendingScrollItemId = editedItemId;
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
  refs.backToLibraryButton.textContent = "Chiudi";
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
  refs.activeCategoryKind.textContent = categoryKindLabel(category.kind);
  refs.itemsSummary.textContent = `${countItems(category.id)} ${countItems(category.id) === 1 ? "elemento" : "elementi"}`;
  renderSortToolbar(activeCategorySort(category.id));

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
    .sort((a, b) => compareItems(a, b, category, activeCategorySort(category.id)));

  refs.itemList.replaceChildren();
  if (!items.length) {
    refs.itemList.append(document.querySelector("#emptyStateTemplate").content.cloneNode(true));
    return;
  }

  for (const item of items) {
    refs.itemList.append(itemCard(item, category));
  }
  scrollPendingItemIntoView();
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
  const previewMode = state.schemaCanCreateCategory;
  const category = previewMode ? draftCategory() : activeCategory();
  const editingField = category.fields.find((field) => field.id === state.editingFieldId);
  const detailMode = Boolean(editingField);
  refs.editCategoryName.value = category.name;
  refs.editCategoryTag.value = categoryIcon(category);
  refs.editCategoryKind.value = editableCategoryKind(category.kind);
  renderCategoryKindPickers();
  setCategoryKindPickerDisabled(refs.editCategoryKind.closest("[data-kind-picker]"), category.kind === "review");
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
  const previewMode = state.schemaCanCreateCategory;
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
    <div class="danger-save-row">
      <button type="button" class="trash-button" data-action="delete" aria-label="Elimina campo">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M6 6l1 15h10l1-15" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
      <button type="submit" class="primary-button full">Salva campo</button>
    </div>
  `;

  form.querySelector('[data-action="back"]').addEventListener("click", () => {
    state.editingFieldId = null;
    renderSchema();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      if (previewMode) {
        updateDraftField(field.id, data);
        state.editingFieldId = field.id;
        renderSchema();
        return;
      }
      await state.catalog.updateField(category.id, field.id, data);
      state.editingFieldId = field.id;
    } catch (error) {
      alert(error.message);
    }
  });

  const deleteButton = form.querySelector('[data-action="delete"]');
  deleteButton?.addEventListener("click", async () => {
    const confirmed = confirmIrreversibleDelete(`Eliminare il campo "${field.label}"?`);
    if (!confirmed) return;
    try {
      if (previewMode) {
        removeDraftField(field.id);
        state.editingFieldId = null;
        renderSchema();
        return;
      }
      await state.catalog.removeField(category.id, field.id);
      state.editingFieldId = null;
      return;
    } catch (error) {
      alert(error.message);
    }
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

function draftCategory() {
  state.draftCategory ??= createCategory({ name: "Nuova categoria", tag: "new" });
  return state.draftCategory;
}

function addDraftField(fieldDraft) {
  const category = draftCategory();
  const field = createField(fieldDraft);
  if (category.fields.some((candidate) => textKey(candidate.label) === textKey(field.label))) {
    throw new Error("Campo gia presente in questa categoria.");
  }

  const usedFieldIds = new Set(category.fields.map((candidate) => candidate.id));
  category.fields = [
    ...category.fields,
    {
      ...field,
      id: makeUniqueId(field.id, usedFieldIds),
      custom: true
    }
  ];
}

function updateDraftField(fieldId, fieldDraft) {
  const category = draftCategory();
  const existing = category.fields.find((field) => field.id === fieldId);
  if (!existing) throw new Error("Campo non trovato.");

  const updated = {
    ...existing,
    label: String(fieldDraft.label || "").trim()
  };
  if (!updated.label) throw new Error("Il nome del campo e obbligatorio.");

  if (existing.type === "rating" || existing.type === "number") {
    updated.min = Number(fieldDraft.min ?? existing.min ?? 0);
    updated.max = Number(fieldDraft.max ?? existing.max ?? 10);
    updated.step = Number(fieldDraft.step ?? existing.step ?? 1);
  }

  if (category.fields.some((field) => field.id !== fieldId && textKey(field.label) === textKey(updated.label))) {
    throw new Error("Campo gia presente in questa categoria.");
  }

  category.fields = category.fields.map((field) => (field.id === fieldId ? updated : field));
}

function removeDraftField(fieldId) {
  const category = draftCategory();
  category.fields = category.fields.filter((candidate) => candidate.id !== fieldId);
}

function moveDraftField(fieldId, targetIndex) {
  const category = draftCategory();
  const fromIndex = category.fields.findIndex((field) => field.id === fieldId);
  if (fromIndex < 0) return;
  const fields = [...category.fields];
  const [field] = fields.splice(fromIndex, 1);
  fields.splice(Math.max(0, Math.min(targetIndex, fields.length)), 0, field);
  category.fields = fields;
  renderSchema();
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
      if (state.schemaCanCreateCategory) {
        moveDraftField(draggedId, Number(row.dataset.index));
        return;
      }
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
  article.dataset.itemId = item.id;
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
  const search = document.createElement("button");
  search.type = "button";
  search.className = "ghost-button compact card-search-button";
  search.setAttribute("aria-label", `Cerca ${item.title} ${category.name}`);
  search.title = "Cerca sul web";
  search.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6"></circle>
      <path d="m16 16 4 4"></path>
    </svg>
  `;
  search.addEventListener("click", () => {
    const params = new URLSearchParams({ q: `${item.title} ${category.name}` });
    window.open(`https://www.google.com/search?${params.toString()}`, "_blank", "noopener,noreferrer");
  });

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

  actions.append(search, edit, remove);
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
  Object.entries(attrs).forEach(([key, attrValue]) => input.setAttribute(key, attrValue));
  input.value = value ?? "";
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

async function closeEditor() {
  if (state.editorMode === "schema" && state.schemaCanCreateCategory) {
    state.editingId = null;
    state.formCategoryId = null;
    state.draftCategory = null;
    state.editingFieldId = null;
    await setView("library");
    return;
  }

  const editingItem = state.vault.items.find((item) => item.id === state.editingId);
  const targetCategoryId = editingItem?.categoryId || state.formCategoryId || activeCategory().id;
  if (editingItem) state.pendingScrollItemId = editingItem.id;

  state.editingId = null;
  state.draftCategory = null;
  state.editingFieldId = null;
  state.formCategoryId = targetCategoryId;
  await state.catalog.setActiveCategory(targetCategoryId);
  await setView("category");
}

function scrollPendingItemIntoView() {
  if (!state.pendingScrollItemId) return;
  const selector = `.memory-card[data-item-id="${CSS.escape(state.pendingScrollItemId)}"]`;
  const target = refs.itemList.querySelector(selector);
  if (!target) {
    state.pendingScrollItemId = null;
    return;
  }

  state.pendingScrollItemId = null;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

async function openItemEditor() {
  state.editorMode = "item";
  state.schemaCanCreateCategory = false;
  state.draftCategory = null;
  state.editingFieldId = null;
  state.formCategoryId = activeCategory().id;
  await setView("editor");
}

async function openSchemaEditor({ canCreateCategory = false } = {}) {
  state.editingId = null;
  state.formCategoryId = activeCategory().id;
  state.editorMode = "schema";
  state.schemaCanCreateCategory = canCreateCategory;
  state.draftCategory = canCreateCategory ? createCategory({ name: "Nuova categoria", tag: "new" }) : null;
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
  if (!isOpen) closeSettingsPanel();
}

function toggleSettingsPanel(isOpen) {
  refs.settingsPanel.hidden = !isOpen;
  refs.settingsToggle.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("settings-open", isOpen);
}

function closeSettingsPanel() {
  toggleSettingsPanel(false);
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

function activeCategorySort(categoryId) {
  const sortMode = state.vault.preferences.categorySorts?.[categoryId];
  const allowed = new Set([
    "updated-desc",
    "updated-asc",
    "created-desc",
    "title-asc",
    "title-desc",
    "status-planned-first",
    "status-done-first",
    "rating-desc",
    "rating-asc"
  ]);
  return allowed.has(sortMode) ? sortMode : "updated-desc";
}

function nextSortMode(currentMode, group) {
  const cycle = {
    title: ["title-asc", "title-desc"],
    status: ["status-planned-first", "status-done-first"],
    rating: ["rating-desc", "rating-asc"],
    latest: ["updated-desc", "updated-asc"]
  }[group];
  if (!cycle) return currentMode;
  return currentMode === cycle[0] ? cycle[1] : cycle[0];
}

function renderSortToolbar(sortMode) {
  for (const button of refs.itemSortToolbar.querySelectorAll("[data-sort-group]")) {
    const group = button.dataset.sortGroup;
    const active = sortGroup(sortMode) === group;
    button.classList.toggle("active", active);
    button.querySelector(".sort-arrow").textContent = active ? sortArrow(sortMode) : "-";
    button.title = sortTitle(group, active ? sortMode : null);
  }
}

function sortGroup(sortMode) {
  if (sortMode.startsWith("title-")) return "title";
  if (sortMode.startsWith("status-")) return "status";
  if (sortMode.startsWith("rating-")) return "rating";
  return "latest";
}

function sortArrow(sortMode) {
  if (sortMode.endsWith("-asc") || sortMode === "status-planned-first") return "^";
  return "v";
}

function sortTitle(group, sortMode) {
  if (sortMode === "title-desc") return "Alfabetico: Z-A";
  if (sortMode === "status-done-first") return "Completati prima";
  if (sortMode === "rating-asc") return "Voto basso prima";
  if (sortMode === "updated-asc") return "Meno recenti prima";
  const labels = {
    title: "Alfabetico: A-Z",
    status: "Non completati prima",
    rating: "Voto alto prima",
    latest: "Piu recenti prima"
  };
  return labels[group] || "Ordina";
}

function compareItems(left, right, category, sortMode) {
  const byTitle = () => titleCollator.compare(left.title, right.title);
  const byUpdatedDesc = () => compareDateDesc(left.updatedAt, right.updatedAt) || byTitle();

  if (sortMode === "title-asc") return byTitle() || byUpdatedDesc();
  if (sortMode === "title-desc") return -byTitle() || byUpdatedDesc();
  if (sortMode === "created-desc") return compareDateDesc(left.createdAt, right.createdAt) || byTitle();
  if (sortMode === "updated-asc") return -compareDateDesc(left.updatedAt, right.updatedAt) || byTitle();
  if (sortMode === "status-planned-first") return compareStatus(left, right, false) || byUpdatedDesc();
  if (sortMode === "status-done-first") return compareStatus(left, right, true) || byUpdatedDesc();
  if (sortMode === "rating-asc") return compareRating(left, right, category, true) || byTitle();
  if (sortMode === "rating-desc") return compareRating(left, right, category, false) || byTitle();
  return byUpdatedDesc();
}

function compareDateDesc(leftDate, rightDate) {
  const leftTime = Date.parse(leftDate || "") || 0;
  const rightTime = Date.parse(rightDate || "") || 0;
  return rightTime - leftTime;
}

function compareStatus(left, right, doneFirst) {
  const rank = (item) => {
    if (item.status === "done") return doneFirst ? 0 : 1;
    return doneFirst ? 1 : 0;
  };
  return rank(left) - rank(right);
}

function compareRating(left, right, category, ascending) {
  const leftScore = averageRating(category, left);
  const rightScore = averageRating(category, right);
  const leftMissing = leftScore === null;
  const rightMissing = rightScore === null;
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return ascending ? leftScore - rightScore : rightScore - leftScore;
}

function editableCategoryKind(kind) {
  return kind === "review" ? "review" : String(kind || "custom");
}

function categoryKindLabel(kind) {
  if (kind === "review") return "Revisione import";
  return String(kind || "custom");
}

function categoryKindChoices() {
  const kinds = new Set(["media", "custom"]);
  for (const category of state.vault.categories) {
    if (category.kind !== "review") kinds.add(category.kind || "custom");
  }
  return [...kinds].filter(Boolean).sort((a, b) => titleCollator.compare(a, b));
}

function renderCategoryKindPickers() {
  for (const picker of refs.categoryKindPickers) {
    const options = picker.querySelector("[data-kind-options]");
    const input = picker.querySelector('input[name="kind"]');
    const newInput = picker.querySelector("[data-kind-new]");
    options.replaceChildren();

    for (const kind of categoryKindChoices()) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "category-kind-option";
      option.dataset.kind = kind;
      option.dataset.kindOption = "";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(input.value === kind));
      option.textContent = kind;
      options.append(option);
    }

    if (newInput) newInput.value = "";
    syncCategoryKindPicker(picker);
  }
}

function toggleCategoryKindMenu(picker) {
  if (!picker || picker.classList.contains("is-disabled")) return;
  const menu = picker.querySelector("[data-kind-menu]");
  const willOpen = menu.hidden;
  closeCategoryKindMenus(picker);
  menu.hidden = !willOpen;
  picker.querySelector("[data-kind-trigger]").setAttribute("aria-expanded", String(willOpen));
}

function closeCategoryKindMenus(except = null) {
  for (const picker of refs.categoryKindPickers) {
    if (picker === except) continue;
    picker.querySelector("[data-kind-menu]").hidden = true;
    picker.querySelector("[data-kind-trigger]").setAttribute("aria-expanded", "false");
  }
}

function setCategoryKindValue(picker, value, { keepNewInput = false } = {}) {
  if (!picker || !String(value || "").trim()) return;
  const input = picker.querySelector('input[name="kind"]');
  input.value = String(value).trim();
  if (input.id === "categoryKind" && state.schemaCanCreateCategory && state.draftCategory) {
    state.draftCategory.kind = input.value;
  }
  if (!keepNewInput) picker.querySelector("[data-kind-new]").value = "";
  syncCategoryKindPicker(picker);
  if (!keepNewInput) closeCategoryKindMenus();
}

function syncCategoryKindPicker(picker) {
  const input = picker.querySelector('input[name="kind"]');
  const trigger = picker.querySelector("[data-kind-trigger]");
  const value = input.value || "custom";
  trigger.textContent = value;
  for (const option of picker.querySelectorAll("[data-kind-option]")) {
    option.setAttribute("aria-selected", String(option.dataset.kind === value));
  }
}

function setCategoryKindPickerDisabled(picker, isDisabled) {
  picker.classList.toggle("is-disabled", isDisabled);
  picker.querySelector("[data-kind-trigger]").disabled = isDisabled;
  picker.querySelector("[data-kind-new]").disabled = isDisabled;
  if (isDisabled) closeCategoryKindMenus();
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

function themeLabel(theme) {
  if (theme === "dark") return "Scuro";
  if (theme === "light") return "Chiaro";
  return "Auto";
}

function confirmIrreversibleDelete(message) {
  const answer = window.prompt(`${message}\n\nOperazione irreversibile: per eliminare digita la parola elimina.`);
  return String(answer || "").trim().toLowerCase() === "elimina";
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

function openMovieListImportDialog() {
  refs.movieListImportForm.reset();
  renderMovieListCategoryOptions();
  renderMovieListImportPreview();
  closeSettingsPanel();
  refs.movieListImportDialog.showModal();
  refs.movieListText.focus();
}

function renderMovieListCategoryOptions() {
  refs.movieListCategory.replaceChildren();

  const temporaryOption = document.createElement("option");
  temporaryOption.value = "";
  temporaryOption.textContent = "Crea lista temporanea";
  refs.movieListCategory.append(temporaryOption);

  for (const category of state.vault.categories) {
    if (category.kind === "review") continue;
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    refs.movieListCategory.append(option);
  }
}

async function submitMovieListImport(event) {
  event.preventDefault();
  const parsed = parseMovieListText(refs.movieListText.value);

  if (parsed.errors.length || !parsed.entries.length) {
    renderMovieListImportPreview(parsed);
    return;
  }

  try {
    const { report } = await state.catalog.importMovieList({
      categoryId: refs.movieListCategory.value || null,
      entries: parsed.entries
    });
    state.editingId = null;
    state.formCategoryId = report.categoryId;
    await setView("category");
    refs.movieListImportDialog.close();
    alert(movieListImportReportText(report));
  } catch (error) {
    refs.movieListPreview.textContent = error.message;
  }
}

function renderMovieListImportPreview(parsed = parseMovieListText(refs.movieListText.value)) {
  if (!refs.movieListText.value.trim()) {
    refs.movieListPreview.textContent = "Incolla una riga per elemento. Il voto finale e opzionale.";
    return;
  }

  const lines = [];
  if (parsed.entries.length) {
    lines.push(`${parsed.entries.length} ${parsed.entries.length === 1 ? "film pronto" : "film pronti"} per l'import.`);
  }
  if (parsed.skippedHeaders.length) {
    lines.push("Intestazione ignorata.");
  }
  if (parsed.errors.length) {
    lines.push("Correggi prima queste righe:");
    lines.push(...parsed.errors.slice(0, 4));
    if (parsed.errors.length > 4) lines.push(`Altri ${parsed.errors.length - 4} errori non mostrati.`);
  }

  refs.movieListPreview.textContent = lines.join("\n") || "Nessun film valido trovato.";
}

function parseMovieListText(text) {
  const entries = [];
  const errors = [];
  const skippedHeaders = [];
  const lines = String(text || "").split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const match = line.match(/^(.+?)\s+([0-9]+(?:[,.][0-9]+)?)$/);
    if (!match) {
      if (!entries.length && /(voto|rating|valutazione|score)/i.test(line)) {
        skippedHeaders.push(index + 1);
        return;
      }
      entries.push({ title: line, rating: null });
      return;
    }

    const title = match[1].trim();
    const rawRating = match[2];
    const rating = Number(rawRating.replace(",", "."));
    if (!title) {
      errors.push(`Riga ${index + 1}: titolo mancante.`);
      return;
    }
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
      entries.push({ title: line, rating: null });
      return;
    }

    entries.push({ title, rating });
  });

  return { entries, errors, skippedHeaders };
}

function movieListImportReportText(report) {
  return [
    "Import film completato.",
    `${report.itemsAdded} card aggiunte in "${report.categoryName}".`,
    report.categoryCreated ? "E stata creata una lista temporanea." : "Import nella lista selezionata.",
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
    deleteCategory: (categoryId) => state.catalog.deleteCategory(categoryId),
    setCategorySort: (categoryId, sortMode) => state.catalog.setCategorySort(categoryId, sortMode),
    addField: (categoryId, fieldDraft) => state.catalog.addField(categoryId, fieldDraft),
    updateField: (categoryId, fieldId, fieldDraft) => state.catalog.updateField(categoryId, fieldId, fieldDraft),
    moveField: (categoryId, fieldId, targetIndex) => state.catalog.moveField(categoryId, fieldId, targetIndex),
    removeField: (categoryId, fieldId) => state.catalog.removeField(categoryId, fieldId),
    upsertItem: (categoryId, formValues, existingId) => state.catalog.upsertItem(categoryId, formValues, existingId),
    setItemDone: (itemId, done) => state.catalog.setItemDone(itemId, done),
    deleteItem: (itemId) => state.catalog.deleteItem(itemId),
    exportJson: () => state.catalog.exportJson(),
    importJson: (jsonText) => state.catalog.importJson(jsonText),
    importMovieList: (payload) => state.catalog.importMovieList(payload)
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
