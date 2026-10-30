// Écouteur d'événement pour le chargement complet du DOM
document.addEventListener('DOMContentLoaded', () => {
  // Variables globales
  let allRecords = [];          // Stocke tous les enregistrements récupérés depuis Grist
  let selectedTags = {};        // Stocke les tags sélectionnés pour chaque colonne de type "tag"
  let selectEls = {};           // Stocke les éléments <select> pour chaque colonne de type "select"
  const STORAGE_KEY = 'grist_filters_state'; // Clé pour sauvegarder l'état des filtres dans localStorage
  const DROPDOWN_THRESHOLD = 10; // Au-delà, on affiche une liste déroulante
  let tagColumns = {};          // Stocke les colonnes de type "tag" (ChoiceList ou RefList)
  let selectColumns = {};       // Stocke les colonnes de type "select" (Choice ou Ref)
  let visibleFilters = { tags: true }; // Stocke la visibilité des filtres (par défaut, les tags sont visibles)
  let columnsOrder = [];        // Stocke l'ordre des colonnes (tags + selects) pour l'affichage

  // Références aux éléments du DOM
  const tagContainer = document.getElementById('tag-filters');          // Conteneur pour les filtres de type "tag"
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
      // Filtre les valeurs vides, null, undefined, et le marqueur "L"
      return v.filter(x => x !== 'L' && x !== null && x !== undefined && x !== '');
    }
    // Retourne un tableau avec la valeur si elle existe, sinon un tableau vide
    return v ? [String(v)] : [];
  };

  // Récupère les colonnes et leurs types depuis les tables Grist
  async function fetchColumnsAndTypes() {
    // Récupère la table des colonnes
    const colTable = await grist.docApi.fetchTable('_grist_Tables_column');
    // Récupère la table des tables
    const tableRef = await grist.docApi.fetchTable('_grist_Tables');

    let tableId;
    try {
      // Essaie de récupérer l'ID de la table sélectionnée
      tableId = await grist.selectedTable.getTableId();
    } catch {
      try {
        // Si échec, essaie de récupérer l'ID depuis les options
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

    // Trouve l'index de la table dans la table des tables
    const tableIdx = tableRef.tableId.indexOf(tableId);
    if (tableIdx === -1) {
      console.error('Table non trouvée :', tableId);
      return;
    }
    const parentRef = tableRef.id[tableIdx];

    // Parcourt les colonnes pour identifier les types "Choice", "Ref", "ChoiceList", "RefList"
    colTable.parentId.forEach((pid, i) => {
      if (pid !== parentRef) return;
      const colId = colTable.colId[i];
      const label = colTable.label[i] || colId;
      const type  = colTable.type[i];
      if (!colId || colId.startsWith('gristHelper') || colId === 'manualSort') return;

      // Stocke les colonnes de type "Choice" ou "Ref" dans selectColumns
      if (type === 'Choice' || type.startsWith('Ref:')) {
        selectColumns[colId] = label;
      }
      // Stocke les colonnes de type "ChoiceList" ou "RefList" dans tagColumns
      else if (type === 'ChoiceList' || type.startsWith('RefList:')) {
        tagColumns[colId] = label;
      }
    });

    // Initialise la visibilité des filtres pour toutes les colonnes
    Object.keys(selectColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
    });
    Object.keys(tagColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
    });

    console.log('select:', selectColumns, 'tags:', tagColumns);
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
    // Crée une liste de toutes les colonnes (tags et selects)
    const allCols = [
      ...Object.keys(tagColumns).map(col => ({ col, type: 'tag' })),
      ...Object.keys(selectColumns).map(col => ({ col, type: 'select' })),
    ];
    // Récupère l'ordre sauvegardé ou utilise un ordre par défaut
    const savedOrder = visibleFilters.order || [];
    const existing = new Set(savedOrder.map(o => o.col));
    // Conserve l'ordre existant et ajoute les nouvelles colonnes à la fin
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
  }

  // Affiche les filtres de type "tag" dans le DOM
  function renderTags(records) {
    tagContainer.innerHTML = '';
    // Filtre les colonnes de type "tag" selon l'ordre défini
    const tagOrder = columnsOrder.filter(o => o.type === 'tag');

    tagOrder.forEach(({ col }) => {
      const label = tagColumns[col];
      if (!label) return;
      // Si le filtre est masqué, on ne l'affiche pas
      if (visibleFilters[col] === false) return;

      // Crée un conteneur pour le groupe de tags
      const wrapper = document.createElement('div');
      wrapper.className = 'tag-group';

      // Crée l'en-tête du groupe de tags
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

      // Titre du groupe
      const title = document.createElement('div');
      title.className = 'tag-title';
      title.style.margin = '0';
      title.textContent = label;

      // Bouton "Tout sélectionner"
      const btnAll = document.createElement('button');
      btnAll.textContent = 'Tout';
      btnAll.style.cssText = 'font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;background:var(--color-background-info);color:var(--color-text-info);border-color:var(--color-border-info);';

      // Bouton "Tout désélectionner"
      const btnNone = document.createElement('button');
      btnNone.textContent = 'Aucun';
      btnNone.style.cssText = 'font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;background:var(--color-background-secondary);color:var(--color-text-secondary);border-color:var(--color-border-secondary);';

      // Ajoute les éléments à l'en-tête
      header.appendChild(title);
      header.appendChild(btnAll);
      header.appendChild(btnNone);
      wrapper.appendChild(header);

      // Crée une ligne pour les tags
      const row = document.createElement('div');
      row.className = 'tag-row';

      // Récupère les valeurs uniques pour cette colonne
      const uniqueValues = [...new Set(records.flatMap(r => cleanVal(r[col])))];
      if (!selectedTags[col]) selectedTags[col] = [];

      
           const useDropdown = uniqueValues.length > DROPDOWN_THRESHOLD;
      let ddToggle = null;

      // Met à jour le style des boutons "Tout" et "Aucun" (et le libellé du menu déroulant)
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

        // Champ de recherche dans la liste
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

      // Écouteurs pour les boutons "Tout" et "Aucun"
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

      // Écouteurs pour les boutons "Tout" et "Aucun"
      btnAll.addEventListener('click', () => {
        selectedTags[col] = [...uniqueValues];
        row.querySelectorAll('.tag').forEach(t => t.classList.add('active'));
        updateBtnStyles();
        applyFilters();
      });

      btnNone.addEventListener('click', () => {
        selectedTags[col] = [];
        row.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
        updateBtnStyles();
        applyFilters();
      });

      updateBtnStyles();
      wrapper.appendChild(row);
      tagContainer.appendChild(wrapper);
    });
  }

  // Affiche les filtres de type "select" dans le DOM
  function renderSelects(records) {
    selectContainer.innerHTML = '';
    selectEls = {};

    // Filtre les colonnes de type "select" selon l'ordre défini
    const selectOrder = columnsOrder.filter(o => o.type === 'select');

    selectOrder.forEach(({ col }) => {
      const label = selectColumns[col];
      if (!label) return;

      // Crée un conteneur pour le filtre
      const wrapper = document.createElement('div');
      wrapper.className = 'filter-card';

      // Titre du filtre
      const title = document.createElement('div');
      title.className = 'filter-title';
      title.textContent = label;

      // Crée un élément <select>
      const select = document.createElement('select');
      select.className = 'filter-multi';
      select.appendChild(new Option('— Tous —', ''));

      // Compte les occurrences de chaque valeur et trie par ordre décroissant
      const counts = countValues(records, col);
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([val, count]) => select.appendChild(new Option(`${val} (${count})`, val)));

      // Ajoute un écouteur pour appliquer les filtres lors du changement
      select.addEventListener('change', applyFilters);
      wrapper.appendChild(title);
      wrapper.appendChild(select);
      selectContainer.appendChild(wrapper);
      selectEls[col] = select;
    });
  }

  // Applique tous les filtres (tags, selects, recherche globale)
  function applyFilters() {
    let filtered = [...allRecords];

    // Filtre par tags sélectionnés
    Object.keys(selectedTags).forEach(col => {
      const vals = selectedTags[col];
      if (vals && vals.length > 0) {
        filtered = filtered.filter(r => cleanVal(r[col]).some(v => vals.includes(v)));
      }
    });

    // Filtre par valeurs sélectionnées dans les <select>
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

    // Met à jour le nombre de résultats et applique les filtres à Grist
    resultsCount.textContent = `Résultats: ${filtered.length}`;
    grist.setSelectedRows(filtered.map(r => r.id));
    updateDisabledOptions(filtered);

    // Sauvegarde l'état des filtres
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTags, selectEls: serializeSelects(), visibleFilters
    }));
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

    // Désactive les options de <select> non disponibles
    Object.keys(selectColumns).forEach(col => {
      if (!selectEls[col]) return;
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
    // Affiche/masque le conteneur des tags
    tagContainer.style.display = visibleFilters.tags ? 'block' : 'none';

    // Affiche/masque chaque groupe de tags individuellement
    tagContainer.querySelectorAll('.tag-group').forEach(group => {
      const groupLabel = group.querySelector('.tag-title')?.textContent;
      const col = Object.entries(tagColumns).find(([_, label]) => label === groupLabel)?.[0];
      if (col) group.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    // Affiche/masque chaque filtre de type "select"
    document.querySelectorAll('.filter-card').forEach(card => {
      const titleText = card.querySelector('.filter-title')?.textContent;
      const col = Object.entries(selectColumns).find(([_, label]) => label === titleText)?.[0];
      if (col) card.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    // Sauvegarde l'état
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTags, selectEls: serializeSelects(), visibleFilters
    }));
  }

  // Affiche les cases à cocher pour gérer la visibilité et l'ordre des filtres
  function renderFilterCheckboxes() {
    filterCheckboxesContainer.innerHTML = '';

    // Ajoute une introduction
    const intro = document.createElement('div');
    intro.style.cssText = 'font-size:0.8em;color:var(--color-text-secondary);margin-bottom:10px;';
    intro.textContent = 'Glisse les éléments pour réordonner. Coche/décoche pour afficher.';
    filterCheckboxesContainer.appendChild(intro);

    // Crée une case à cocher pour chaque colonne
    columnsOrder.forEach(({ col, type }) => {
      const label = type === 'tag' ? tagColumns[col] : selectColumns[col];
      if (!label) return;

      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.dataset.col = col;
      div.dataset.type = type;
      div.draggable = true;
      div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:grab;border-radius:4px;border:1px solid transparent;transition:background 0.15s;';

      // Icône de glisser-déposer
      const handle = document.createElement('span');
      handle.textContent = '⠿';
      handle.style.cssText = 'color:var(--color-text-tertiary);font-size:1.1em;flex-shrink:0;';

      // Badge pour indiquer le type (tag ou filtre)
      const badge = document.createElement('span');
      badge.textContent = type === 'tag' ? 'tag' : 'filtre';
      badge.style.cssText = `font-size:0.7em;padding:1px 5px;border-radius:3px;flex-shrink:0;
        background:${type === 'tag' ? 'var(--color-background-info)' : 'var(--color-background-secondary)'};
        color:${type === 'tag' ? 'var(--color-text-info)' : 'var(--color-text-secondary)'};`;

      // Case à cocher
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `order-${col}`;
      checkbox.checked = visibleFilters[col] !== false;
      checkbox.addEventListener('change', e => {
        visibleFilters[col] = e.target.checked;
        renderTags(allRecords);
        updateFilterVisibility();
      });

      // Libellé de la case à cocher
      const labelEl = document.createElement('label');
      labelEl.htmlFor = `order-${col}`;
      labelEl.textContent = label;
      labelEl.style.cssText = 'flex:1;cursor:pointer;';

      // Ajoute les éléments au conteneur
      div.appendChild(handle);
      div.appendChild(badge);
      div.appendChild(checkbox);
      div.appendChild(labelEl);
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
      // Supprime les indicateurs visuels
      filterCheckboxesContainer.querySelectorAll('[data-col]').forEach(el => {
        el.style.borderTop = '';
        el.style.background = '';
      });
    });

    filterCheckboxesContainer.addEventListener('dragover', e => {
      e.preventDefault();
      const target = e.target.closest('[data-col]');
      if (!target || target === dragEl) return;
      // Ajoute un indicateur visuel pour la cible
      filterCheckboxesContainer.querySelectorAll('[data-col]').forEach(el => {
        el.style.borderTop = '';
        el.style.background = '';
      });
      target.style.borderTop = '2px solid var(--color-text-info)';
    });

    filterCheckboxesContainer.addEventListener('drop', e => {
      e.preventDefault();
      const target = e.target.closest('[data-col]');
      if (!target || target === dragEl) return;

      const fromCol = dragEl.dataset.col;
      const toCol = target.dataset.col;

      const fromIdx = columnsOrder.findIndex(o => o.col === fromCol);
      const toIdx   = columnsOrder.findIndex(o => o.col === toCol);

      // Réorganise l'ordre des colonnes
      const [moved] = columnsOrder.splice(fromIdx, 1);
      columnsOrder.splice(toIdx, 0, moved);
      visibleFilters.order = columnsOrder;

      // Sauvegarde et rafraîchit l'affichage
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedTags, selectEls: serializeSelects(), visibleFilters
      }));

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
      if (state.visibleFilters) visibleFilters = state.visibleFilters;
      Object.entries(state.selectEls || {}).forEach(([col, val]) => {
        if (selectEls[col]) selectEls[col].value = val;
      });
      updateFilterVisibility();
    } catch (e) {
      console.error('Erreur restauration état :', e);
    }
  }

  // Écouteurs d'événements
  resetButton.addEventListener('click', () => {
    selectedTags = {};
    Object.values(selectEls).forEach(sel => sel.value = '');
    globalSearch.value = '';
    renderTags(allRecords);
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
    renderTags(allRecords);
    updateFilterVisibility();
    renderFilterCheckboxes();
  });

  deselectAllBtn.addEventListener('click', () => {
    visibleFilters.tags = false;
    Object.keys(selectColumns).forEach(col => { visibleFilters[col] = false; });
    Object.keys(tagColumns).forEach(col => { visibleFilters[col] = false; });
    renderTags(allRecords);
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

    try {
      await fetchColumnsAndTypes();
    } catch (error) {
      console.error('Impossible de récupérer les métadonnées :', error);
    }

    initOrder();
    applyOrder();

    resultsCount.textContent = `🔢 Résultats: ${allRecords.length}`;
    grist.setSelectedRows(allRecords.map(r => r.id));

    restoreState();
  });
});