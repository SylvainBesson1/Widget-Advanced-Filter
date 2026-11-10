// Écouteur d'événement pour le chargement complet du DOM
document.addEventListener('DOMContentLoaded', () => {
  // Variables globales
  let allRecords = [];          // Stocke tous les enregistrements récupérés depuis Grist
  let selectedTags = {};        // Stocke les tags sélectionnés pour chaque colonne de type "tag"
  let selectedTexts = {};       // Stocke le texte de recherche pour chaque colonne de type "text"
  let textModes = {};           // Stocke le mode d'affichage pour chaque colonne texte : 'search' | 'dropdown' | 'both'
  let selectEls = {};           // Stocke les éléments <select> (colonnes "select" + listes déroulantes des colonnes "text")
  let textEls = {};             // Stocke les éléments <input> de recherche pour chaque colonne de type "text"
  const STORAGE_KEY = 'grist_filters_state'; // Clé pour sauvegarder l'état des filtres dans localStorage
  const DROPDOWN_THRESHOLD = 10; // Au-delà, on affiche une liste déroulante (pour les tags)
  let tagColumns = {};          // Stocke les colonnes de type "tag" (ChoiceList ou RefList)
  let selectColumns = {};       // Stocke les colonnes de type "select" (Choice ou Ref)
  let textColumns = {};         // Stocke les colonnes de type "text" (Text ou Note)
  let visibleFilters = { tags: true }; // Stocke la visibilité des filtres (par défaut, les tags sont visibles)
  let columnsOrder = [];        // Stocke l'ordre des colonnes (tags + selects + textes) pour l'affichage

  // Références aux éléments du DOM
  const tagContainer = document.getElementById('tag-filters');          // Conteneur pour les filtres de type "tag"
  const textContainer = document.getElementById('text-filters');        // Conteneur pour les filtres de type "text"
  const selectContainer = document.getElementById('dynamic-filters');   // Conteneur pour les filtres de type "select"
  const globalSearch = document.getElementById('global-search');        // Champ de recherche globale
  const resultsCount = document.getElementById('results-count');        // Affichage du nombre de résultats
  const resetButton = document.getElementById('reset-filters');         // Bouton pour réinitialiser les filtres
  const manageFiltersBtn = document.getElementById('manage-filters-btn'); // Bouton pour gérer les filtres
  const filterModal = document.getElementById('filter-modal');         // Modale pour la gestion des filtres
  const closeModalBtn = document.getElementById('close-modal');         // Bouton pour fermer la modale
  const filterCheckboxesContainer = document.getElementById('filter-checkboxes'); // Conteneur pour les cases à cocher de gestion des filtres
  const selectAllBtn = document.getElementById('select-all');           // Bouton pour tout sélectionner
  const deselectAllBtn = document.getElementById('deselect-all');     // Bouton pour tout désélectionner

  // Ferme les listes déroulantes quand on clique ailleurs
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.dd-panel').forEach(panel => {
      if (!panel.parentElement.contains(e.target)) panel.style.display = 'none';
    });
  });

  // Fonction utilitaire pour nettoyer les valeurs Grist (retire le marqueur "L" des ChoiceList)
  const cleanVal = (v) => {
    if (Array.isArray(v)) {
      return v.filter(x => x !== 'L' && x !== null && x !== undefined && x !== '');
    }
    return v ? [String(v)] : [];
  };

  // Sauvegarde l'état courant des filtres dans localStorage
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTags, selectedTexts, textModes, selectEls: serializeSelects(), visibleFilters
    }));
  }

  // Récupère les colonnes et leurs types depuis les tables Grist
  async function fetchColumnsAndTypes(records) {
    const colTable = await grist.docApi.fetchTable('_grist_Tables_column');
    const tableRef = await grist.docApi.fetchTable('_grist_Tables');

    let tableId;
    try {
      tableId = await grist.selectedTable.getTableId();
    } catch {
      try {
        tableId = await grist.getOption('tableId');
      } catch {
        console.error('Impossible de récupérer le tableId.');
        return;
      }
    }

    if (!tableId) {
      console.error('tableId est vide.');
      return;
    }

    const tableIdx = tableRef.tableId.indexOf(tableId);
    if (tableIdx === -1) {
      console.error('Table non trouvée :', tableId);
      return;
    }
    const parentRef = tableRef.id[tableIdx];

    // ===== Colonnes visibles =====
    const recordKeys = records && records.length > 0 ? new Set(Object.keys(records[0])) : null;

    colTable.parentId.forEach((pid, i) => {
      if (pid !== parentRef) return;
      const colId = colTable.colId[i];
      const label = colTable.label[i] || colId;
      const type  = colTable.type[i];
      if (!colId || colId.startsWith('gristHelper') || colId === 'manualSort') return;
      if (colTable.isHiddenCol && colTable.isHiddenCol[i]) return;
      if (recordKeys && !recordKeys.has(colId)) return;

      if (type === 'Choice' || type.startsWith('Ref:')) {
        selectColumns[colId] = label;
      }
      else if (type === 'ChoiceList' || type.startsWith('RefList:')) {
        tagColumns[colId] = label;
      }
      else if (type === 'Text' || type === 'Note') {
        textColumns[colId] = label;
      }
    });

    // Exclut toute colonne sans aucune valeur dans les enregistrements
    if (records && records.length > 0) {
      const hasValues = (col) => records.some(r => cleanVal(r[col]).length > 0);
      Object.keys(selectColumns).forEach(col => { if (!hasValues(col)) delete selectColumns[col]; });
      Object.keys(tagColumns).forEach(col => { if (!hasValues(col)) delete tagColumns[col]; });
      Object.keys(textColumns).forEach(col => {
        if (!records.some(r => r[col] !== null && r[col] !== undefined && String(r[col]) !== '')) delete textColumns[col];
      });
    }

    // Initialise la visibilité et le mode d'affichage par défaut des filtres
    Object.keys(selectColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
    });
    Object.keys(tagColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
    });
    Object.keys(textColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
      if (textModes[col] === undefined) textModes[col] = 'search'; // mode par défaut : recherche
    });

    console.log('select:', selectColumns, 'tags:', tagColumns, 'text:', textColumns, 'modes:', textModes);
  }

  // Compte les occurrences de chaque valeur pour une colonne donnée
  function countValues(records, col) {
    const counts = {};
    records.forEach(r => {
      cleanVal(r[col]).forEach(v => {
        counts[v] = (counts[v] || 0) + 1;
      });
    });
    return counts;
  }

  // Initialise l'ordre des colonnes si ce n'est pas déjà fait
  function initOrder() {
    const allCols = [
      ...Object.keys(tagColumns).map(col => ({ col, type: 'tag' })),
      ...Object.keys(selectColumns).map(col => ({ col, type: 'select' })),
      ...Object.keys(textColumns).map(col => ({ col, type: 'text' })),
    ];
    const savedOrder = visibleFilters.order || [];
    const existing = new Set(savedOrder.map(o => o.col));
    columnsOrder = [
      ...savedOrder.filter(o => allCols.some(c => c.col === o.col)),
      ...allCols.filter(c => !existing.has(c.col)),
    ];
    visibleFilters.order = columnsOrder;
  }

  // Applique l'ordre des colonnes et rafraîchit l'affichage
  function applyOrder() {
    initOrder();
    renderTags(allRecords);
    renderSelects(allRecords);
    renderTexts(allRecords);
  }

  // Affiche les filtres de type "tag" dans le DOM
  function renderTags(records) {
    tagContainer.innerHTML = '';
    const tagOrder = columnsOrder.filter(o => o.type === 'tag');

    tagOrder.forEach(({ col }) => {
      const label = tagColumns[col];
      if (!label) return;
      if (visibleFilters[col] === false) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'tag-group';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

      const title = document.createElement('div');
      title.className = 'tag-title';
      title.style.margin = '0';
      title.textContent = label;

      const btnAll = document.createElement('button');
      btnAll.textContent = 'Tout';
      btnAll.style.cssText = 'font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;background:var(--color-background-info);color:var(--color-text-info);border-color:var(--color-border-info);';

      const btnNone = document.createElement('button');
      btnNone.textContent = 'Aucun';
      btnNone.style.cssText = 'font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;background:var(--color-background-secondary);color:var(--color-text-secondary);border-color:var(--color-border-secondary);';

      header.appendChild(title);
      header.appendChild(btnAll);
      header.appendChild(btnNone);
      wrapper.appendChild(header);

      const row = document.createElement('div');
      row.className = 'tag-row';

      const uniqueValues = [...new Set(records.flatMap(r => cleanVal(r[col])))];
      if (!selectedTags[col]) selectedTags[col] = [];

      const useDropdown = uniqueValues.length > DROPDOWN_THRESHOLD;
      let ddToggle = null;

      const updateBtnStyles = () => {
        const allSelected = uniqueValues.every(v => selectedTags[col].includes(v));
        const noneSelected = selectedTags[col].length === 0;
        btnAll.style.fontWeight = allSelected ? '600' : '400';
        btnAll.style.opacity = allSelected ? '1' : '0.6';
        btnNone.style.fontWeight = noneSelected ? '600' : '400';
        btnNone.style.opacity = noneSelected ? '1' : '0.6';
        if (ddToggle) {
          const n = selectedTags[col].length;
          ddToggle.textContent = (n === 0 ? '— Tous —' : `${n} sélectionné${n > 1 ? 's' : ''}`) + ' ▾';
        }
      };

      if (!useDropdown) {
        // ===== Mode pastilles (≤ 10 valeurs) =====
        uniqueValues.forEach(val => {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = val;
          if (selectedTags[col].includes(val)) tag.classList.add('active');
          tag.addEventListener('click', () => {
            if (selectedTags[col].includes(val)) {
              selectedTags[col] = selectedTags[col].filter(v => v !== val);
              tag.classList.remove('active');
            } else {
              selectedTags[col].push(val);
              tag.classList.add('active');
            }
            updateBtnStyles();
            applyFilters();
          });
          row.appendChild(tag);
        });
      } else {
        // ===== Mode liste déroulante (> 10 valeurs) =====
        const dd = document.createElement('div');
        dd.className = 'tag-dropdown';

        ddToggle = document.createElement('button');
        ddToggle.type = 'button';
        ddToggle.className = 'dd-toggle';

        const panel = document.createElement('div');
        panel.className = 'dd-panel';
        panel.style.display = 'none';

        const ddSearch = document.createElement('input');
        ddSearch.type = 'text';
        ddSearch.className = 'dd-search';
        ddSearch.placeholder = 'Rechercher...';
        ddSearch.addEventListener('input', () => {
          const q = ddSearch.value.toLowerCase();
          panel.querySelectorAll('.dd-option').forEach(o => {
            o.style.display = o.dataset.value.toLowerCase().includes(q) ? 'flex' : 'none';
          });
        });
        panel.appendChild(ddSearch);

        uniqueValues.forEach(val => {
          const opt = document.createElement('label');
          opt.className = 'dd-option';
          opt.dataset.value = val;

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = selectedTags[col].includes(val);
          cb.addEventListener('change', () => {
            if (cb.checked) {
              if (!selectedTags[col].includes(val)) selectedTags[col].push(val);
            } else {
              selectedTags[col] = selectedTags[col].filter(v => v !== val);
            }
            updateBtnStyles();
            applyFilters();
          });

          const txt = document.createElement('span');
          txt.textContent = val;

          opt.appendChild(cb);
          opt.appendChild(txt);
          panel.appendChild(opt);
        });

        ddToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = panel.style.display === 'block';
          document.querySelectorAll('.dd-panel').forEach(p => p.style.display = 'none');
          panel.style.display = open ? 'none' : 'block';
          if (!open) ddSearch.focus();
        });

        dd.appendChild(ddToggle);
        dd.appendChild(panel);
        row.appendChild(dd);
      }

      btnAll.addEventListener('click', () => {
        selectedTags[col] = [...uniqueValues];
        row.querySelectorAll('.tag').forEach(t => t.classList.add('active'));
        row.querySelectorAll('.dd-option input').forEach(c => c.checked = true);
        updateBtnStyles();
        applyFilters();
      });

      btnNone.addEventListener('click', () => {
        selectedTags[col] = [];
        row.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
        row.querySelectorAll('.dd-option input').forEach(c => c.checked = false);
        updateBtnStyles();
        applyFilters();
      });

      updateBtnStyles();
      wrapper.appendChild(row);
      tagContainer.appendChild(wrapper);
    });
  }

  // Affiche les filtres de type "text" dans le DOM (recherche et/ou liste déroulante selon le mode choisi)
  function renderTexts(records) {
    if (!textContainer) return;
    textContainer.innerHTML = '';
    textEls = {};

    const textOrder = columnsOrder.filter(o => o.type === 'text');

    textOrder.forEach(({ col }) => {
      const label = textColumns[col];
      if (!label) return;
      if (visibleFilters[col] === false) return;

      const mode = textModes[col] || 'search';

      const wrapper = document.createElement('div');
      wrapper.className = 'filter-card';

      const title = document.createElement('div');
      title.className = 'filter-title';
      title.textContent = label;
      wrapper.appendChild(title);

      // ===== Mode recherche (champ texte) =====
      if (mode === 'search' || mode === 'both') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'filter-text';
        input.placeholder = `Rechercher dans ${label}...`;
        input.value = selectedTexts[col] || '';
        input.addEventListener('input', () => {
          selectedTexts[col] = input.value;
          applyFilters();
        });
        wrapper.appendChild(input);
        textEls[col] = input;
      }

      // ===== Mode liste déroulante (valeurs uniques) =====
      if (mode === 'dropdown' || mode === 'both') {
        const select = document.createElement('select');
        select.className = 'filter-multi';
        select.appendChild(new Option('— Tous —', ''));

        const counts = countValues(records, col);
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([val, count]) => select.appendChild(new Option(`${val} (${count})`, val)));

        select.addEventListener('change', applyFilters);
        wrapper.appendChild(select);
        selectEls[col] = select; // réutilise selectEls : applyFilters/serializeSelects/updateDisabledOptions fonctionnent sans changement
      }

      textContainer.appendChild(wrapper);
    });
  }

  // Affiche les filtres de type "select" dans le DOM
  function renderSelects(records) {
    selectContainer.innerHTML = '';
    selectEls = {};

    const selectOrder = columnsOrder.filter(o => o.type === 'select');

    selectOrder.forEach(({ col }) => {
      const label = selectColumns[col];
      if (!label) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'filter-card';

      const title = document.createElement('div');
      title.className = 'filter-title';
      title.textContent = label;

      const select = document.createElement('select');
      select.className = 'filter-multi';
      select.appendChild(new Option('— Tous —', ''));

      const counts = countValues(records, col);
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([val, count]) => select.appendChild(new Option(`${val} (${count})`, val)));

      select.addEventListener('change', applyFilters);
      wrapper.appendChild(title);
      wrapper.appendChild(select);
      selectContainer.appendChild(wrapper);
      selectEls[col] = select;
    });
  }

  // Applique tous les filtres (tags, textes, selects, recherche globale)
  function applyFilters() {
    Object.keys(selectedTags).forEach(col => {
      if (!tagColumns[col]) delete selectedTags[col];
    });

    let filtered = [...allRecords];

    // Filtre par tags sélectionnés
    Object.keys(selectedTags).forEach(col => {
      const vals = selectedTags[col];
      if (vals && vals.length > 0) {
        filtered = filtered.filter(r => cleanVal(r[col]).some(v => vals.includes(v)));
      }
    });

    // Filtre par recherche texte par colonne
    Object.keys(textEls).forEach(col => {
      const q = (selectedTexts[col] || '').toLowerCase().trim();
      if (q) {
        filtered = filtered.filter(r =>
          String(r[col] ?? '').toLowerCase().includes(q)
        );
      }
    });

    // Filtre par valeurs sélectionnées dans les <select> (colonnes select + listes déroulantes texte)
    Object.keys(selectEls).forEach(col => {
      const val = selectEls[col]?.value;
      if (val) {
        filtered = filtered.filter(r => cleanVal(r[col]).includes(val));
      }
    });

    // Filtre par recherche globale
    const search = globalSearch.value.toLowerCase().trim();
    if (search) {
      filtered = filtered.filter(r =>
        Object.values(r).some(v => {
          if (!v) return false;
          if (Array.isArray(v)) return v.some(x => String(x).toLowerCase().includes(search));
          return String(v).toLowerCase().includes(search);
        })
      );
    }

    resultsCount.textContent = `Résultats: ${filtered.length}`;
    grist.setSelectedRows(filtered.map(r => r.id));
    updateDisabledOptions(filtered);

    saveState();
  }

  // Met à jour les options désactivées (pour les valeurs non disponibles après filtrage)
  function updateDisabledOptions(filtered) {
    // Désactive les tags non disponibles
    Object.keys(tagColumns).forEach(col => {
      const counts = countValues(filtered, col);
      tagContainer.querySelectorAll('.tag-group').forEach(group => {
        if (group.querySelector('.tag-title')?.textContent !== tagColumns[col]) return;
        group.querySelectorAll('.tag').forEach(tag => {
          tag.classList.toggle('disabled', !counts[tag.textContent]);
        });
        group.querySelectorAll('.dd-option').forEach(opt => {
          const unavailable = !counts[opt.dataset.value];
          opt.classList.toggle('disabled', unavailable);
          opt.querySelector('input').disabled = unavailable;
        });
      });
    });

    // Désactive les options de <select> non disponibles (y compris les listes déroulantes des colonnes texte)
    Object.keys(selectEls).forEach(col => {
      const counts = countValues(filtered, col);
      Array.from(selectEls[col].options).forEach(opt => {
        if (!opt.value) return;
        opt.disabled = !counts[opt.value];
      });
    });
  }

  // Sérialise les valeurs des <select> pour la sauvegarde
  function serializeSelects() {
    const sel = {};
    Object.entries(selectEls).forEach(([col, selEl]) => { sel[col] = selEl.value; });
    return sel;
  }

  // Met à jour la visibilité des filtres en fonction de l'état
  function updateFilterVisibility() {
    tagContainer.style.display = visibleFilters.tags ? 'block' : 'none';

    tagContainer.querySelectorAll('.tag-group').forEach(group => {
      const groupLabel = group.querySelector('.tag-title')?.textContent;
      const col = Object.entries(tagColumns).find(([_, label]) => label === groupLabel)?.[0];
      if (col) group.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    if (textContainer) {
      textContainer.querySelectorAll('.filter-card').forEach(card => {
        const titleText = card.querySelector('.filter-title')?.textContent;
        const col = Object.entries(textColumns).find(([_, label]) => label === titleText)?.[0];
        if (col) card.style.display = visibleFilters[col] !== false ? 'block' : 'none';
      });
    }

    document.querySelectorAll('#dynamic-filters .filter-card').forEach(card => {
      const titleText = card.querySelector('.filter-title')?.textContent;
      const col = Object.entries(selectColumns).find(([_, label]) => label === titleText)?.[0];
      if (col) card.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    saveState();
  }

  // Affiche les cases à cocher pour gérer la visibilité, l'ordre et le mode des filtres
  function renderFilterCheckboxes() {
    filterCheckboxesContainer.innerHTML = '';

    const intro = document.createElement('div');
    intro.style.cssText = 'font-size:0.8em;color:var(--color-text-secondary);margin-bottom:10px;';
    intro.textContent = 'Glisse les éléments pour réordonner. Coche/décoche pour afficher. Choisis le mode des filtres texte.';
    filterCheckboxesContainer.appendChild(intro);

    columnsOrder.forEach(({ col, type }) => {
      const label = type === 'tag' ? tagColumns[col]
                  : type === 'select' ? selectColumns[col]
                  : textColumns[col];
      if (!label) return;

      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.dataset.col = col;
      div.dataset.type = type;
      div.draggable = true;
      div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:grab;border-radius:4px;border:1px solid transparent;transition:background 0.15s;';

      const handle = document.createElement('span');
      handle.textContent = '⠿';
      handle.style.cssText = 'color:var(--color-text-tertiary);font-size:1.1em;flex-shrink:0;';

      const badge = document.createElement('span');
      const badgeLabel = { tag: 'tag', select: 'filtre', text: 'texte' }[type];
      badge.textContent = badgeLabel;
      badge.style.cssText = `font-size:0.7em;padding:1px 5px;border-radius:3px;flex-shrink:0;
        background:${type === 'tag' ? 'var(--color-background-info)' : 'var(--color-background-secondary)'};
        color:${type === 'tag' ? 'var(--color-text-info)' : 'var(--color-text-secondary)'};`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `order-${col}`;
      checkbox.checked = visibleFilters[col] !== false;
      checkbox.addEventListener('change', e => {
        visibleFilters[col] = e.target.checked;
        applyOrder();
        updateFilterVisibility();
      });

      const labelEl = document.createElement('label');
      labelEl.htmlFor = `order-${col}`;
      labelEl.textContent = label;
      labelEl.style.cssText = 'flex:1;cursor:pointer;';

      div.appendChild(handle);
      div.appendChild(badge);
      div.appendChild(checkbox);
      div.appendChild(labelEl);

      // ===== Sélecteur de mode pour les colonnes texte =====
      if (type === 'text') {
        const modeSelect = document.createElement('select');
        modeSelect.style.cssText = 'font-size:0.75em;padding:1px 4px;border-radius:3px;flex-shrink:0;cursor:pointer;';
        modeSelect.appendChild(new Option('Recherche', 'search'));
        modeSelect.appendChild(new Option('Liste déroulante', 'dropdown'));
        modeSelect.appendChild(new Option('Les deux', 'both'));
        modeSelect.value = textModes[col] || 'search';
        modeSelect.addEventListener('change', () => {
          textModes[col] = modeSelect.value;
          saveState();
          applyOrder();   // reconstruit le filtre avec le nouveau mode
          applyFilters(); // réapplique les filtres actifs
        });
        modeSelect.addEventListener('mousedown', e => e.stopPropagation()); // évite de déclencher le drag
        div.appendChild(modeSelect);
      }

      filterCheckboxesContainer.appendChild(div);
    });

    // Gestion du glisser-déposer pour réordonner les filtres
    let dragEl = null;

    filterCheckboxesContainer.addEventListener('dragstart', e => {
      dragEl = e.target.closest('[draggable]');
      if (!dragEl) return;
      dragEl.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });

    filterCheckboxesContainer.addEventListener('dragend', e => {
      if (dragEl) dragEl.style.opacity = '1';
      dragEl = null;
      filterCheckboxesContainer.querySelectorAll('[data-col]').forEach(el => {
        el.style.borderTop = '';
        el.style.background = '';
      });
    });

    filterCheckboxesContainer.addEventListener('dragover', e => {
      e.preventDefault();
      const target = e.target.closest('[data-col]');
      if (!target || target === dragEl) return;
      filterCheckboxesContainer.querySelectorAll('[data-col]').forEach(el => {
        el.style.borderTop = '';
        el.style.background = '';
      });
      target.style.borderTop = '2px solid var(--color-text-info)';
    });

    filterCheckboxesContainer.addEventListener('drop', e => {
      e.preventDefault();
      const target = e.target.closest('[data-col]');
      if (!target || !dragEl || target === dragEl) return;

      const fromCol = dragEl.dataset.col;
      const toCol = target.dataset.col;

      const fromIdx = columnsOrder.findIndex(o => o.col === fromCol);
      const toIdx   = columnsOrder.findIndex(o => o.col === toCol);

      const [moved] = columnsOrder.splice(fromIdx, 1);
      columnsOrder.splice(toIdx, 0, moved);
      visibleFilters.order = columnsOrder;

      saveState();

      renderFilterCheckboxes();
      applyOrder();
    });
  }

  // Restaure l'état des filtres depuis localStorage
  function restoreState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const state = JSON.parse(saved);
      selectedTags = state.selectedTags || {};
      selectedTexts = state.selectedTexts || {};
      textModes = state.textModes || {};
      if (state.visibleFilters) visibleFilters = state.visibleFilters;

      // Rend les filtres (les modes texte doivent être connus avant le rendu)
      applyOrder();

      // Réapplique les valeurs sauvegardées
      Object.entries(state.selectEls || {}).forEach(([col, val]) => {
        if (selectEls[col]) selectEls[col].value = val;
      });
      Object.keys(textEls).forEach(col => {
        textEls[col].value = selectedTexts[col] || '';
      });

      updateFilterVisibility();
      applyFilters();
    } catch (e) {
      console.error('Erreur restauration état :', e);
    }
  }

  // Écouteurs d'événements
  resetButton.addEventListener('click', () => {
    selectedTags = {};
    selectedTexts = {};
    Object.values(selectEls).forEach(sel => sel.value = '');
    Object.values(textEls).forEach(inp => inp.value = '');
    globalSearch.value = '';
    renderTags(allRecords);
    renderTexts(allRecords);
    applyFilters();
  });

  manageFiltersBtn.addEventListener('click', () => {
    filterModal.style.display = 'flex';
    renderFilterCheckboxes();
  });

  closeModalBtn.addEventListener('click', () => {
    filterModal.style.display = 'none';
  });

  selectAllBtn.addEventListener('click', () => {
    visibleFilters.tags = true;
    Object.keys(selectColumns).forEach(col => { visibleFilters[col] = true; });
    Object.keys(tagColumns).forEach(col => { visibleFilters[col] = true; });
    Object.keys(textColumns).forEach(col => { visibleFilters[col] = true; });
    applyOrder();
    updateFilterVisibility();
    renderFilterCheckboxes();
  });

  deselectAllBtn.addEventListener('click', () => {
    visibleFilters.tags = false;
    Object.keys(selectColumns).forEach(col => { visibleFilters[col] = false; });
    Object.keys(tagColumns).forEach(col => { visibleFilters[col] = false; });
    Object.keys(textColumns).forEach(col => { visibleFilters[col] = false; });
    applyOrder();
    updateFilterVisibility();
    renderFilterCheckboxes();
  });

  globalSearch.addEventListener('input', applyFilters);

  // Initialisation de Grist
  grist.ready({ requiredAccess: 'full', allowSelectBy: true });

  // Écouteur pour les enregistrements Grist
  grist.onRecords(async (records) => {
    allRecords = records;
    tagColumns = {};
    selectColumns = {};
    textColumns = {};

    try {
      await fetchColumnsAndTypes(records);
    } catch (error) {
      console.error('Impossible de récupérer les métadonnées :', error);
    }

    initOrder();
    applyOrder();

    resultsCount.textContent = `Résultats: ${allRecords.length}`;
    grist.setSelectedRows(allRecords.map(r => r.id));

    restoreState();
  });
});