// Vérifier si le compte dans l'URL correspond au compte connecté
const urlParams = new URLSearchParams(window.location.search);
const urlAccount = urlParams.get('account');
const currentAccount = sessionStorage.getItem('currentAccount');
const COUCHDB_BASE_URL = "https://couchdb.monproprecloud.fr";
const COUCHDB_DB_URL = `${COUCHDB_BASE_URL}/stocks`;

if (urlAccount && urlAccount !== currentAccount) {
  window.location.href = 'index.html';
}

// Configuration PouchDB
const localDB = new PouchDB("stocks");
let remoteDB = null;
const STOCK_STATE_PREFIX = "stock_state::";
let syncHandler = null;

// Variables globales
let allDocs = [];
let filteredDocs = [];
let currentPage = 1;
const itemsPerPage = 30;
let totalPages = 1;
let selectedDocs = new Set();
let editModalPhotos = []; // Photos temporaires pendant l'édition
let stockStateByCode = new Map();

function clearClientSession() {
  sessionStorage.removeItem("currentAccount");
  sessionStorage.removeItem("currentServiceName");
  sessionStorage.removeItem("authenticated");
}

function setupRemoteDB() {
  if (remoteDB) return remoteDB;

  remoteDB = new PouchDB(COUCHDB_DB_URL, {
    fetch: (url, options = {}) => {
      const requestOptions = options;
      requestOptions.credentials = "include";
      if (requestOptions.headers) {
        delete requestOptions.headers.Authorization;
      }
      return PouchDB.fetch(url, requestOptions);
    },
    skip_setup: true
  });

  return remoteDB;
}

function startSync() {
  if (syncHandler) return;

  syncHandler = localDB.sync(setupRemoteDB(), { live: true, retry: true })
    .on("error", async (error) => {
      console.error("Erreur de synchronisation :", error);
      if (error && (error.status === 401 || error.name === "unauthorized")) {
        alert("Session CouchDB expirée. Veuillez vous reconnecter.");
        await logout();
      }
    });
}

async function ensureAuthenticatedSession() {
  const storedAccount = sessionStorage.getItem("currentAccount");
  const isAuthenticated = sessionStorage.getItem("authenticated") === "true";

  if (!storedAccount || !isAuthenticated) {
    clearClientSession();
    window.location.href = "login.html";
    return false;
  }

  try {
    const response = await fetch(`${COUCHDB_BASE_URL}/_session`, {
      method: "GET",
      credentials: "include"
    });
    const session = await response.json();

    if (!response.ok || !session.userCtx || session.userCtx.name !== storedAccount) {
      clearClientSession();
      window.location.href = "login.html";
      return false;
    }

    return true;
  } catch (error) {
    console.error("Erreur vérification session :", error);
    clearClientSession();
    window.location.href = "login.html";
    return false;
  }
}

// Gestionnaire de modales
const modalManager = {
  currentModal: null,

  openModal: function(content, isEdit = false) {
    this.closeCurrent();
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = isEdit ? 'editModal' : 'detailsModal';
    modal.innerHTML = content;
    
    document.body.appendChild(modal);
    this.currentModal = modal;
    modal.style.display = 'flex';

    return modal;
  },

  closeCurrent: function() {
    if (this.currentModal) {
      this.currentModal.remove();
      this.currentModal = null;
    }
  }
};

// Fonctions utilitaires pour la gestion des dates
// Fonction pour compresser les images (identique à app.js)
function compresserImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = (img.height / img.width) * 800;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(callback, 'image/jpeg', 0.7);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function formatToDateTimeLocal(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateForDisplay(isoString) {
  if (!isoString) return '';
  
  const date = new Date(isoString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function normalizeProductCode(code) {
  return String(code || "").trim().toLowerCase();
}

function parseNonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function getStockStateDocId(code) {
  return `${STOCK_STATE_PREFIX}${normalizeProductCode(code)}`;
}

function isTrackedMagasin(magasin) {
  const normalizedMagasin = String(magasin || "").trim().toUpperCase();
  return normalizedMagasin === "ER-MP" || normalizedMagasin === "ER-MG";
}

function getStockStateForCode(code) {
  return stockStateByCode.get(normalizeProductCode(code)) || null;
}

function getResolvedStockValues(doc) {
  const stockState = getStockStateForCode(doc.code_produit || doc.codeproduit);

  return {
    stockActuel: parseNonNegativeNumber(
      stockState?.stock_actuel,
      getNumericValue(doc.stock_actuel, doc.stock_apres, 0) || 0
    ),
    stockMin: parseNonNegativeNumber(
      stockState?.stock_min,
      getNumericValue(doc.stock_min, 0) || 0
    ),
    stockMax: parseNonNegativeNumber(
      stockState?.stock_max,
      getNumericValue(doc.stock_max, 0) || 0
    )
  };
}

function setStockColumnVisibility(visible) {
  ["stockActuelHeader", "stockMinHeader", "stockMaxHeader"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = visible ? "" : "none";
    }
  });
}

function isBobinesAccount() {
  return sessionStorage.getItem('currentAccount') === 'BOB329';
}

function setBobinesTableColumnsVisibility(hidden) {
  [
    'designationHeader',
    'unitesHeader',
    'aCommanderHeader',
    'magasinHeader',
    'axe2Header',
    'stockActuelHeader',
    'stockMinHeader',
    'stockMaxHeader'
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = hidden ? 'none' : '';
    }
  });
}

function setBobinesFilterVisibility(hidden) {
  ['commandeFilterContainer', 'magasinFilterContainer'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = hidden ? 'none' : '';
    }
  });
}

async function upsertStockState(code, stockActuel, stockMin, stockMax) {
  const originalCode = String(code || "").trim();
  const normalizedCode = normalizeProductCode(code);
  if (!normalizedCode) return;

  const docId = getStockStateDocId(normalizedCode);

  try {
    const existingDoc = await localDB.get(docId);
    await localDB.put({
      ...existingDoc,
      type: "stock_state",
      code_produit: originalCode,
      stock_actuel: stockActuel,
      stock_min: stockMin,
      stock_max: stockMax,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    if (error.status !== 404) throw error;

    await localDB.put({
      _id: docId,
      type: "stock_state",
      code_produit: originalCode,
      stock_actuel: stockActuel,
      stock_min: stockMin,
      stock_max: stockMax,
      updated_at: new Date().toISOString()
    });
  }
}

// Initialisation
document.addEventListener("DOMContentLoaded", async () => {
  if (!(await ensureAuthenticatedSession())) {
    return;
  }

  setupRemoteDB();
  startSync();

  const currentAccount = sessionStorage.getItem('currentAccount');
  const statsContainer = document.getElementById('statsContainer');
  const topProductsSection = document.getElementById('topProductsSection');

  // Bobines : cacher CSV/mail standard, afficher bouton Excel
  if (currentAccount === 'BOB329') {
    document.getElementById('exportBtn').style.display = 'none';
    document.getElementById('exportToDriveBtn').style.display = 'none';
    document.getElementById('exportXlsxBobinesBtn').style.display = '';
    if (statsContainer) {
      statsContainer.style.display = 'none';
    }
    if (topProductsSection) {
      topProductsSection.style.display = 'none';
    }
    setBobinesTableColumnsVisibility(true);
    setBobinesFilterVisibility(true);
  } else {
    // Afficher CSV/mail, cacher le bouton Excel bobines
    document.getElementById('exportBtn').style.display = '';
    document.getElementById('exportToDriveBtn').style.display = '';
    document.getElementById('exportXlsxBobinesBtn').style.display = 'none';
    if (statsContainer) {
      statsContainer.style.display = '';
    }
    if (topProductsSection) {
      topProductsSection.style.display = '';
    }
    setBobinesTableColumnsVisibility(false);
    setBobinesFilterVisibility(false);
  }
  document.getElementById('dateFilter').value = (new Date()).toISOString().split('T')[0];
  initAdmin();
});

function initAdmin() {
  checkAuth();
  setupEventListeners();

  const currentAccount = sessionStorage.getItem('currentAccount');
  const urlParams = new URLSearchParams(window.location.search);
  const fromIndex = urlParams.get('fromIndex');


  if (fromIndex === 'true') {
    // Forcer le filtre sur le compte courant
    document.getElementById('filterSelect').value = currentAccount;
    document.getElementById('filterSelect').disabled = true;
    document.getElementById('currentServiceLabel').textContent = `Mes enregistrements (${getAxe1Label(currentAccount)})`;
  }

  loadData();
}

function checkAuth() {
  const currentAccount = sessionStorage.getItem('currentAccount');
  if (!currentAccount) {
    window.location.href = 'login.html';
    return;
  }

  // Nouvelle vérification pour l'accès à admin.html
  const urlParams = new URLSearchParams(window.location.search);
  const fromIndex = urlParams.get('fromIndex');
  
  // Autoriser l'accès si:
  // 1. C'est un admin OU
  // 2. On vient de index.html (paramètre fromIndex=true)
  if (currentAccount !== 'Admin' && fromIndex !== 'true') {
    window.location.href = 'index.html';
    return;
  }

  applyAccountFilter(currentAccount);
}

function applyAccountFilter(account) {
  const filterSelect = document.getElementById('filterSelect');
  const currentServiceLabel = document.getElementById('currentServiceLabel');
  const urlParams = new URLSearchParams(window.location.search);
  const fromIndex = urlParams.get('fromIndex');

  // Ajouter la classe has-value au container du select
  const filterContainer = filterSelect.closest('.filter-container');
  
  if (fromIndex === 'true') {
    filterSelect.value = account;
    filterSelect.disabled = true;
    currentServiceLabel.textContent = `Mes enregistrements (${getAxe1Label(account)})`;
    filterContainer.classList.add('has-value');
  } else if (account === 'Admin') {
    filterSelect.disabled = false;
    filterSelect.value = '';
    currentServiceLabel.textContent = 'Tous les comptes (mode Admin)';
    filterContainer.classList.remove('has-value');
  } else {
    filterSelect.value = account;
    filterSelect.disabled = true;
    currentServiceLabel.textContent = getAxe1Label(account);
    filterContainer.classList.add('has-value');
  }
  
  // Mettre à jour le label de l'utilisateur connecté en haut à droite
  const currentServiceName = sessionStorage.getItem('currentServiceName');
  document.getElementById('currentUserLabel').textContent = currentServiceName || getAxe1Label(account);
}

function getAxe1Label(axe1) {
  const mappings = {
    'SCT=E260329': 'SCE Informations Sportives',
    'SCT=E272329': 'SCE Support Rédaction',
    'SCT=E370329': 'Maintenance Machines',
    'SCT=E382329': 'Service Rotatives',
    'SCT=E390329': 'Service Expédition',
    'SCT=E500329': 'Direction Vente',
    'SCT=E730329': 'LER Charges',
    'SCT=E736329': 'Service Travaux',
    'SCT=E760329': 'Achats Magasin',
    'SCT=E762329': 'Manutention Papier',
    'SCT=E772329': 'Coursiers',
    'SCT=E860329': 'Cantine',
    'SCT=E359329': 'SMI',
    'Admin': 'Compte Admin',
    "BOB329": "Bobines"
  };
  
  return mappings[axe1] || axe1;
}

function setupEventListeners() {
  // Ajout du bouton Retour
  if (!document.getElementById('backBtn')) {
  const backBtn = document.createElement('button');
  backBtn.id = 'backBtn';
  backBtn.textContent = 'Retour';
  backBtn.className = 'btn-secondary';
  backBtn.style.marginRight = '10px';

  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn.parentNode.insertBefore(backBtn, logoutBtn);

  backBtn.addEventListener('click', () => {
    const currentAccount = sessionStorage.getItem('currentAccount');
    if (currentAccount) {
      if (currentAccount === "BOB329") {
        window.location.href = "bobines.html";
      } else if (currentAccount === "Admin") {
        window.location.href = "login.html";
      } else {
        window.location.href = "index.html";
      }
    } else {
      window.location.href = "login.html";
    }
  });
}

  
  backBtn.addEventListener('click', () => {
    const currentAccount = sessionStorage.getItem('currentAccount');
     if (currentAccount) {
        // Si c'est le compte Bobines, rediriger vers bobines.html
        if (currentAccount === "BOB329") {
            window.location.href = "bobines.html";
        } 
        // Si c'est Admin, rediriger vers login.html
        else if (currentAccount === "Admin") {
            window.location.href = "login.html";
        } 
        // Tous les autres comptes vont vers index.html
        else {
            window.location.href = "index.html";
        }
    } else {
        window.location.href = "login.html";
    }
  });
 
  
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('syncBtn').addEventListener('click', syncWithServer);
  document.getElementById('deleteSelectedBtn').addEventListener('click', confirmDeleteSelected);
  document.getElementById('deleteAllBtn').addEventListener('click', confirmDeleteAll);
  document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
  document.getElementById('exportToDriveBtn').addEventListener('click', exportAndSendEmail);

  document.getElementById('searchInput').addEventListener('input', () => {
    currentPage = 1;
    filterData();
  });
  
  document.getElementById('filterSelect').addEventListener('change', () => {
    currentPage = 1;
    filterData();
  });
  
  document.getElementById('dateFilter').addEventListener('change', () => {
    currentPage = 1;
    filterData();
  });
  
  document.getElementById('commandeFilter').addEventListener('change', async () => {
    currentPage = 1;
    filterData();

    const commandeFilter = document.getElementById('commandeFilter').value;
    if (commandeFilter !== 'oui') {
      return;
    }

    if (filteredDocs.length === 0) {
      alert("Aucun produit à commander pour ce filtre.");
      return;
    }

    const choice = await showOrderMailPrompt();

    if (choice === 'yes') {
      await sendFilteredOrderEmail();
      return;
    }

    if (choice === 'cancel') {
      document.getElementById('commandeFilter').value = '';
      currentPage = 1;
      filterData();
    }
  });
  
  document.getElementById('magasinFilter').addEventListener('change', () => {
    currentPage = 1;
    filterData();
  });

  document.getElementById('firstPageBtn').addEventListener('click', () => goToPage(1));
  document.getElementById('prevPageBtn').addEventListener('click', () => goToPage(currentPage - 1));
  document.getElementById('nextPageBtn').addEventListener('click', () => goToPage(currentPage + 1));
  document.getElementById('lastPageBtn').addEventListener('click', () => goToPage(totalPages));
  
  document.getElementById('selectAll').addEventListener('change', toggleSelectAll);
  document.getElementById('dataTable').addEventListener('click', handleTableClick);
}



function handleTableClick(e) {
  const target = e.target;
  const docId = target.dataset.id;

  if (!docId) return;

  if (target.classList.contains('view-btn')) {
    showDetails(docId);
  } else if (target.classList.contains('edit-btn')) {
    const doc = allDocs.find(d => d._id === docId);
    if (doc) setupEditModal(doc);
  } else if (target.classList.contains('delete-btn')) {
    confirmDelete(docId);
  } else if (target.classList.contains('row-checkbox')) {
    if (target.checked) {
      selectedDocs.add(docId);
    } else {
      selectedDocs.delete(docId);
    }
    updateSelectedCount();
    updateSelectAllCheckbox();
  }
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterSelect').value = '';
  document.getElementById('dateFilter').value = new Date().toISOString().split('T')[0];
  document.getElementById('commandeFilter').value = '';
  document.getElementById('magasinFilter').value = '';
  currentPage = 1;
  filterData();
}

async function loadData() {
  try {
    const result = await localDB.allDocs({ include_docs: true });
    const docs = result.rows
      .map(row => row.doc)
      .filter(doc => !doc._id.startsWith('_design'));

    stockStateByCode = new Map(
      docs
        .filter(doc => doc.type === 'stock_state')
        .map((doc) => [normalizeProductCode(doc.code_produit || doc._id.replace(STOCK_STATE_PREFIX, "")), doc])
    );

    allDocs = docs
      .filter(doc => doc.type !== 'stock_state')
      .sort((a, b) => new Date(b._id) - new Date(a._id));
    
    filterData();
  } catch (error) {
    console.error("Erreur lors du chargement:", error);
    alert("Erreur lors du chargement des données");
  }
}

function filterData() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const filterValue = document.getElementById('filterSelect').value;
  const dateFilterValue = document.getElementById('dateFilter').value;
  const commandeFilter = document.getElementById('commandeFilter').value;
  const magasinFilter = document.getElementById('magasinFilter').value;
  const docsForOrderCalculation = filterValue
    ? allDocs.filter((doc) => doc.axe1 === filterValue)
    : allDocs;
  const latestStocksByCode = new Map(
    buildLatestStockByProduct(docsForOrderCalculation).map((item) => [item.code, item])
  );

  filteredDocs = allDocs.filter(doc => {
    const rawCode = doc.code_produit ?? doc.codeproduit;
    const normalizedCode = rawCode ? String(rawCode).trim().toLowerCase() : '';

    // Filtre par compte
    if (filterValue && doc.axe1 !== filterValue) return false;
    
    // Filtre par date (uniquement si une date est spécifiée)
    if (dateFilterValue) {
      const docDate = doc.date_sortie ? new Date(doc.date_sortie) : new Date(doc._id);
      const filterDate = new Date(dateFilterValue);
      
      if (!(docDate.getFullYear() === filterDate.getFullYear() &&
          docDate.getMonth() === filterDate.getMonth() && 
          docDate.getDate() === filterDate.getDate())) {
        return false;
      }
    }
    
    // Filtre "À commander"
    if (commandeFilter) {
      const latestStock = latestStocksByCode.get(normalizedCode);

      if (!latestStock || latestStock.latestDoc._id !== doc._id) {
        return false;
      }

      const shouldOrder = shouldOrderFromStockValues(
        latestStock.stockActuel,
        latestStock.stockMin,
        latestStock.stockMax
      );

      if (commandeFilter === 'oui' && !shouldOrder) {
        return false;
      }
      if (commandeFilter === 'non' && shouldOrder) {
        return false;
      }
    }

    // Filtre "Magasin"
    if (magasinFilter) {
      const magasinValue = doc.magasin ? doc.magasin.toString().trim().toUpperCase() : '';
      
      if (magasinFilter === 'ER-MG' && magasinValue !== 'ER-MG') {
        return false;
      }
      if (magasinFilter === 'ER-MP' && magasinValue !== 'ER-MP') {
        return false;
      }
    }
    
    // Filtre par recherche
    if (searchTerm) {
      const searchFields = [
        doc.code_produit?.toString().toLowerCase() || '',
        doc.designation?.toString().toLowerCase() || '',
        doc.axe2?.toString().toLowerCase() || '',
        doc.remarques?.toString().toLowerCase() || ''
      ];
      
      if (!searchFields.some(field => field.includes(searchTerm))) {
        return false;
      }
    }
    
    return true;
  });

  updateStats();
  renderTable();
}

function renderTable() {
  const tableBody = document.getElementById('dataTable').querySelector('tbody');
  tableBody.innerHTML = '';
  setStockColumnVisibility(true);
  setBobinesTableColumnsVisibility(isBobinesAccount());

  totalPages = Math.ceil(filteredDocs.length / itemsPerPage);
  currentPage = Math.min(currentPage, totalPages);
  
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDocs = filteredDocs.slice(startIndex, startIndex + itemsPerPage);

  paginatedDocs.forEach(doc => {
    const row = document.createElement('tr');
    const isSelected = selectedDocs.has(doc._id);
    const hasPhotos = Array.isArray(doc.photos) && doc.photos.length > 0;
    const shouldDisplayStock = isTrackedMagasin(doc.magasin);
    const stockValues = getResolvedStockValues(doc);
    const hideBobinesColumns = isBobinesAccount();

    row.innerHTML = `
      <td><input type="checkbox" class="row-checkbox" data-id="${doc._id}" ${isSelected ? 'checked' : ''}></td>
      <td>${doc.date_sortie ? formatDateForDisplay(doc.date_sortie) : formatDateForDisplay(doc._id)}</td>
      <td>${doc.code_produit || ''}</td>
      ${hideBobinesColumns ? '' : `<td class="designation-cell" title="${doc.designation || ''}">${doc.designation || ''}</td>`}
      <td>${doc.quantité_consommee ?? doc.quantite_consommee ?? ''}</td>
      ${hideBobinesColumns ? '' : `<td>${doc.unites || ''}</td>`}
      ${hideBobinesColumns ? '' : `<td>${doc.a_commander || ''}</td>`}
      ${hideBobinesColumns ? '' : `<td>${doc.magasin || ''}</td>`}
      <td>${getAxe1Label(doc.axe1)}</td>
      ${hideBobinesColumns ? '' : `<td>${doc.axe2 || ''}</td>`}
      ${hideBobinesColumns ? '' : `<td>${shouldDisplayStock ? stockValues.stockActuel : ''}</td>`}
      ${hideBobinesColumns ? '' : `<td>${shouldDisplayStock ? stockValues.stockMin : ''}</td>`}
      ${hideBobinesColumns ? '' : `<td>${shouldDisplayStock ? stockValues.stockMax : ''}</td>`}
      <td class="photo-indicator">${hasPhotos ? '📷' : ''}</td>
      <td>
        <div class="action-buttons-container">
          <button class="view-btn" data-id="${doc._id}">👁️</button>
          <button class="edit-btn" data-id="${doc._id}">✏️</button>
          <button class="delete-btn" data-id="${doc._id}">🗑️</button>
        </div>
      </td>
    `;

    tableBody.appendChild(row);
  });

  updatePagination();
}

function getDocDate(doc) {
  const d = new Date(doc.date_sortie || doc._id);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function getNumericValue(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function getQuantityValue(doc) {
  return getNumericValue(doc.quantité_consommee, doc.quantite_consommee) || 0;
}

function buildLatestStockByProduct(docs) {
  const latestDocsByCode = new Map();

  docs.forEach((doc) => {
    const rawCode = doc.code_produit ?? doc.codeproduit;
    const normalizedCode = rawCode ? String(rawCode).trim().toLowerCase() : '';
    if (!normalizedCode) return;

    const timestamp = getDocDate(doc).getTime();
    const previous = latestDocsByCode.get(normalizedCode);

    if (!previous || timestamp > previous.timestamp) {
      latestDocsByCode.set(normalizedCode, { doc, timestamp });
    }
  });

  return Array.from(latestDocsByCode.entries()).map(([normalizedCode, entry]) => {
    const stockValues = getResolvedStockValues(entry.doc);
    return {
      code: normalizedCode,
      stockActuel: stockValues.stockActuel,
      stockMin: stockValues.stockMin,
      stockMax: stockValues.stockMax,
      timestamp: entry.timestamp,
      latestDoc: entry.doc
    };
  });
}

function getStockStatus(stockActuel, stockMin, stockMax, quantiteConsommee) {
  const stockApres = Math.max(0, stockActuel - quantiteConsommee);
  const isMaxReached = stockMax > 0 && stockActuel >= stockMax;

  if (stockApres === 0) {
    return { shouldOrder: true };
  }

  if (isMaxReached) {
    return { shouldOrder: false };
  }

  if (stockApres <= stockMin) {
    return { shouldOrder: true };
  }

  return { shouldOrder: false };
}

function shouldOrderFromStockValues(stockActuel, stockMin, stockMax) {
  return getStockStatus(stockActuel, stockMin, stockMax, 0).shouldOrder;
}

function updateEditCommanderField() {
  const commanderField = document.getElementById('edit_a_commander');
  if (!commanderField) return;

  const stockActuel = parseNonNegativeNumber(document.getElementById('edit_stock_actuel')?.value, 0);
  const stockMin = parseNonNegativeNumber(document.getElementById('edit_stock_min')?.value, 0);
  const stockMax = parseNonNegativeNumber(document.getElementById('edit_stock_max')?.value, 0);
  const quantiteConsommee = parseNonNegativeNumber(
    document.getElementById('edit_quantité_consommee')?.value ?? document.getElementById('edit_quantite_consommee')?.value,
    0
  );

  const status = getStockStatus(stockActuel, stockMin, stockMax, quantiteConsommee);
  commanderField.value = status.shouldOrder ? 'Oui' : 'Non';
}

function bindEditStockFieldListeners() {
  ['edit_stock_actuel', 'edit_stock_min', 'edit_stock_max', 'edit_quantité_consommee', 'edit_quantite_consommee']
    .forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', updateEditCommanderField);
      input.addEventListener('change', updateEditCommanderField);
    });

  updateEditCommanderField();
}

function getCodeLabel(doc) {
  return doc.code_produit || doc.codeproduit || 'sans-code';
}

function getDesignationLabel(doc) {
  return doc.designation || doc.Designation || 'Sans désignation';
}

function renderTopProducts(topProducts) {
  const container = document.getElementById('topProductsList');
  if (!container) return;

  if (!topProducts.length) {
    container.innerHTML = '<div class="top-product-row">Aucune sortie sur les 30 derniers jours.</div>';
    return;
  }

  container.innerHTML = topProducts.map((item, idx) => `
    <div class="top-product-row">
      <span class="top-product-rank">#${idx + 1}</span>
      <span class="top-product-code">${item.code}</span>
      <span>${item.designation}</span>
      <span class="top-product-qty">${item.qty.toLocaleString('fr-FR')}</span>
    </div>
  `).join('');
}

function updateStats() {
  const currentAccount = sessionStorage.getItem('currentAccount');
  const isAdmin = currentAccount === 'Admin';
  
  // Filtrer les données par service (sauf pour l'admin)
  const filteredByAccount = isAdmin 
    ? allDocs 
    : allDocs.filter(doc => doc.axe1 === currentAccount);

  // 1. Statistiques de base
  document.getElementById('totalCount').textContent = filteredByAccount.length;

  // 2. Activité récente (7 jours)
  const last7Days = filteredByAccount.filter(doc => {
    const docDate = getDocDate(doc);
    return docDate > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });
  document.getElementById('last7DaysCount').textContent = last7Days.length;
  document.getElementById('qtyOut7Days').textContent = last7Days
    .reduce((sum, doc) => sum + getQuantityValue(doc), 0)
    .toLocaleString('fr-FR');

  // 3. Articles à commander (calculés depuis le dernier stock par produit)
  const latestStocks = buildLatestStockByProduct(filteredByAccount);
  const toOrder = latestStocks.filter(item => 
    shouldOrderFromStockValues(item.stockActuel, item.stockMin, item.stockMax)
  );
  document.getElementById('toOrderCount').textContent = toOrder.length;
  document.getElementById('urgentOrders').textContent = toOrder.length > 5 ? "!" : "";
  document.getElementById('trackedProductsCount').textContent = latestStocks.length;

  const ruptures = latestStocks.filter(item => item.stockActuel <= 0);
  const underMin = latestStocks.filter(item => item.stockActuel > 0 && item.stockActuel <= item.stockMin);
  const maxReached = latestStocks.filter(item => item.stockMax > 0 && item.stockActuel >= item.stockMax);

  document.getElementById('ruptureCount').textContent = ruptures.length;
  document.getElementById('underMinCount').textContent = underMin.length;
  document.getElementById('maxReachedCount').textContent = maxReached.length;

  // 4. Répartition par magasin
  const magasinMP = filteredByAccount.filter(doc => doc.magasin === 'ER-MP').length;
  const magasinMG = filteredByAccount.filter(doc => doc.magasin === 'ER-MG').length;
  document.getElementById('magasinMP').textContent = magasinMP;
  document.getElementById('magasinMG').textContent = magasinMG;
  document.getElementById('trendTotal').textContent = `${latestStocks.length} produit(s) suivis`;

  const now = Date.now();
  const window30d = 30 * 24 * 60 * 60 * 1000;
  const last30DaysDocs = filteredByAccount.filter((doc) => getDocDate(doc).getTime() > (now - window30d));

  const topByCode = new Map();
  last30DaysDocs.forEach((doc) => {
    const normalizedCode = getCodeLabel(doc).toString().trim().toLowerCase();
    if (!normalizedCode) return;
    const qty = getQuantityValue(doc);
    if (qty <= 0) return;

    const existing = topByCode.get(normalizedCode) || {
      code: getCodeLabel(doc),
      designation: getDesignationLabel(doc),
      qty: 0
    };
    existing.qty += qty;
    if ((!existing.designation || existing.designation === 'Sans désignation') && getDesignationLabel(doc) !== 'Sans désignation') {
      existing.designation = getDesignationLabel(doc);
    }
    topByCode.set(normalizedCode, existing);
  });

  const topProducts = Array.from(topByCode.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
  renderTopProducts(topProducts);

  const consumptionByCode = new Map();
  last30DaysDocs.forEach((doc) => {
    const normalizedCode = getCodeLabel(doc).toString().trim().toLowerCase();
    if (!normalizedCode) return;
    const qty = getQuantityValue(doc);
    if (qty <= 0) return;
    consumptionByCode.set(normalizedCode, (consumptionByCode.get(normalizedCode) || 0) + qty);
  });

  const coverages = latestStocks.map((item) => {
    const dailyConsumption = (consumptionByCode.get(item.code || '') || 0) / 30;
    if (dailyConsumption <= 0) return null;
    return item.stockActuel / dailyConsumption;
  }).filter((value) => value !== null && Number.isFinite(value));

  const avgCoverage = coverages.length
    ? (coverages.reduce((sum, days) => sum + days, 0) / coverages.length)
    : 0;
  document.getElementById('avgCoverageDays').textContent = avgCoverage ? avgCoverage.toFixed(1) : '0';

  // [Optionnel] Tendances (flèches ↑/↓)
  updateTrends(filteredByAccount);
}

// Fonction pour calculer les tendances
function updateTrends(data) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const lastWeekData = data.filter(doc => {
    const docTime = getDocDate(doc).getTime();
    return docTime > (now - 2 * weekMs) && docTime <= (now - weekMs);
  });

  const currentWeekData = data.filter(doc => {
    const docTime = getDocDate(doc).getTime();
    return docTime > (now - weekMs);
  });

  const trendElement = document.getElementById('trend7Days');
  if (lastWeekData.length > 0) {
    const trend = ((currentWeekData.length - lastWeekData.length) / lastWeekData.length) * 100;
    trendElement.innerHTML = trend >= 0 ? `↑ ${Math.abs(trend.toFixed(1))}%` : `↓ ${Math.abs(trend.toFixed(1))}%`;
    trendElement.style.color = trend >= 0 ? '#2ecc71' : '#e74c3c';
  } else {
    trendElement.textContent = 'N/A';
    trendElement.style.color = '#6c757d';
  }
}

function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = selectedDocs.size;
}

function updateSelectAllCheckbox() {
  const allChecked = filteredDocs.every(doc => selectedDocs.has(doc._id));
  document.getElementById('selectAll').checked = allChecked && filteredDocs.length > 0;
  document.getElementById('selectAll').indeterminate = 
    !allChecked && filteredDocs.some(doc => selectedDocs.has(doc._id));
}

function toggleSelectAll(e) {
  const checkboxes = document.querySelectorAll('.row-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = e.target.checked;
    const docId = checkbox.dataset.id;
    if (e.target.checked) {
      selectedDocs.add(docId);
    } else {
      selectedDocs.delete(docId);
    }
  });
  updateSelectedCount();
}

function updatePagination() {
  const pageInfo = document.getElementById('paginationInfo');
  const pageNumbers = document.getElementById('pageNumbers');
  
  pageInfo.textContent = `Page ${currentPage} sur ${totalPages} - ${filteredDocs.length} éléments`;
  
  document.getElementById('firstPageBtn').disabled = currentPage === 1;
  document.getElementById('prevPageBtn').disabled = currentPage === 1;
  document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
  document.getElementById('lastPageBtn').disabled = currentPage === totalPages;
  
  pageNumbers.innerHTML = '';
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = i;
    pageBtn.className = i === currentPage ? 'active' : '';
    pageBtn.addEventListener('click', () => goToPage(i));
    pageNumbers.appendChild(pageBtn);
  }
}

function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderTable();
}

async function syncWithServer() {
  try {
    await localDB.sync(setupRemoteDB());
    alert("Synchronisation réussie");
    loadData();
  } catch (error) {
    console.error("Erreur de synchronisation:", error);
    alert("Erreur lors de la synchronisation");
  }
}

function setupEditModal(doc) {
  // Réinitialiser les photos temporaires
  editModalPhotos = [];
  const editableDoc = { ...doc };
  if (isTrackedMagasin(doc.magasin)) {
    const stockValues = getResolvedStockValues(doc);
    editableDoc.stock_actuel = stockValues.stockActuel;
    editableDoc.stock_min = stockValues.stockMin;
    editableDoc.stock_max = stockValues.stockMax;
  }
  
  const modalContent = `
    <div class="edit-modal-content">
      <span class="close-btn">&times;</span>
      <h2>Modifier l'entrée</h2>
      <form id="editForm">
        ${generateEditFields(editableDoc)}
        
        <div class="photo-section" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
          <h3 style="margin-bottom: 10px;">📸 Photos</h3>
          <div class="photo-buttons">
            <button type="button" id="takePhotoBtnModal">
              <span style="font-size: 1.2em;">📸</span> Prendre une photo
            </button>
            <button type="button" id="chooseGalleryBtnModal">
              <span style="font-size: 1.2em;">🖼️</span> Choisir depuis la galerie
            </button>
            <input type="file" id="cameraInputModal" accept="image/*" capture="environment" style="display:none;">
            <input type="file" id="galleryInputModal" accept="image/*" multiple style="display:none;">
          </div>
          <p class="photo-count">Photos : <span id="photoCountModal">${doc.photos ? doc.photos.length : 0}</span>/3</p>
          <div id="previewContainerModal" class="preview-container"></div>
        </div>
      </form>
      <div class="modal-actions">
        <button id="saveEditBtn" class="btn-primary">Enregistrer</button>
        <button id="cancelEditBtn" class="btn-secondary">Annuler</button>
      </div>
    </div>
  `;
  
  const modal = modalManager.openModal(modalContent, true);
  bindEditStockFieldListeners();

  // Initialiser les photos existantes
  if (doc.photos && doc.photos.length > 0) {
    editModalPhotos = doc.photos.map(photoBase64 => ({ dataUrl: photoBase64, existing: true }));
    renderModalPhotoPreviews();
  }

  // Écouteurs pour les boutons de photo
  modal.querySelector('#cameraInputModal').addEventListener('change', (e) => handleModalFiles(e.target.files));
  modal.querySelector('#galleryInputModal').addEventListener('change', (e) => handleModalFiles(e.target.files));
  modal.querySelector('#takePhotoBtnModal').addEventListener('click', (e) => {
    e.preventDefault();
    modal.querySelector('#cameraInputModal').click();
  });
  modal.querySelector('#chooseGalleryBtnModal').addEventListener('click', (e) => {
    e.preventDefault();
    modal.querySelector('#galleryInputModal').click();
  });

  modal.querySelector('.close-btn').addEventListener('click', () => {
    editModalPhotos = [];
    modalManager.closeCurrent();
  });
  
  modal.querySelector('#cancelEditBtn').addEventListener('click', () => {
    editModalPhotos = [];
    modalManager.closeCurrent();
  });

  modal.querySelector('#saveEditBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await saveEditedDoc(doc._id);
    editModalPhotos = [];
    modalManager.closeCurrent();
  });
}

function generateEditFields(doc) {
  let fields = '';
  const excludedFields = ['_id', '_rev', 'axe1', 'photos'];
  // Vérifier si c'est une bobine
  const isBobine = doc.axe1 === 'BOB329' || doc.type === 'bobine';
  
  for (const [key, value] of Object.entries(doc)) {
    if (excludedFields.includes(key) || key.startsWith('_')) continue;
    
    fields += `
      <div class="form-group">
        <label for="edit_${key}">${formatFieldName(key)}:</label>
        ${getInputField(key, value, isBobine)}
      </div>
    `;
  }
  
  return fields;
}

function getInputField(key, value, isBobine = false) {
  if (key === 'a_commander') {
    return `
      <input type="text" id="edit_${key}" class="form-control" value="${value || ''}" readonly disabled>
    `;
  } else if (key === 'unites') {
    // Pour les bobines, défaut "bobine", sinon vide
    const defaultValue = isBobine ? 'bobine' : (value || '');
    return `
      <input type="text" id="edit_${key}" class="form-control" value="${defaultValue}">
    `;
  } else if (key === 'magasin') {
    // Pour les bobines, défaut "EN-MP", sinon vide
    const defaultValue = isBobine ? 'EN-MP' : (value || '');
    return `
      <input type="text" id="edit_${key}" class="form-control" value="${defaultValue}">
    `;
  } else if (key === 'date_sortie') {
    return `<input type="datetime-local" id="edit_${key}" class="form-control" value="${formatToDateTimeLocal(value)}">`;
  } else if (key === 'remarques') {
    return `<textarea id="edit_${key}" class="form-control">${value || ''}</textarea>`;
  } else {
    const type = typeof value === 'number' ? 'number' : 'text';
    return `<input type="${type}" id="edit_${key}" class="form-control" value="${value || ''}">`;
  }
}

async function saveEditedDoc(docId) {
  try {
    const doc = await localDB.get(docId);
    const form = document.getElementById('editForm');
    const inputs = form.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
      const key = input.id.replace('edit_', '');
      if (key === 'a_commander') return;
      if (input.type === 'datetime-local') {
        doc[key] = input.value ? new Date(input.value).toISOString() : '';
      } else {
        doc[key] = input.type === 'number' ? parseFloat(input.value) : input.value;
      }
    });

    if (Number.isFinite(doc.stock_actuel) && doc.stock_actuel >= 0) {
      doc.stock_apres = doc.stock_actuel;
    }

    const stockStatus = getStockStatus(
      parseNonNegativeNumber(doc.stock_actuel, 0),
      parseNonNegativeNumber(doc.stock_min, 0),
      parseNonNegativeNumber(doc.stock_max, 0),
      parseNonNegativeNumber(doc.quantité_consommee ?? doc.quantite_consommee, 0)
    );
    doc.a_commander = stockStatus.shouldOrder ? 'Oui' : 'Non';
    
    // Sauvegarder les photos modifiées
    if (editModalPhotos.length > 0) {
      doc.photos = editModalPhotos.map(photo => photo.dataUrl || photo);
    } else {
      doc.photos = [];
    }
    
    await localDB.put(doc);

    if (isTrackedMagasin(doc.magasin)) {
      await upsertStockState(
        doc.code_produit || doc.codeproduit,
        parseNonNegativeNumber(doc.stock_actuel, 0),
        parseNonNegativeNumber(doc.stock_min, 0),
        parseNonNegativeNumber(doc.stock_max, 0)
      );
    }

    alert('Modifications enregistrées avec succès');

    loadData();
  } catch (error) {
    console.error("Erreur lors de la mise à jour:", error);
    alert("Erreur lors de la mise à jour");
  }
}

function handleModalFiles(fileList) {
  const files = Array.from(fileList);
  if (editModalPhotos.length + files.length > 3) {
    alert("Maximum 3 photos !");
    return;
  }

  files.forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    compresserImage(file, (blob) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        editModalPhotos.push({ dataUrl: e.target.result, existing: false });
        renderModalPhotoPreviews();
      };
      reader.readAsDataURL(blob);
    });
  });
}

function showOrderMailPrompt() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0, 0, 0, 0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';

    const dialog = document.createElement('div');
    dialog.style.background = '#fff';
    dialog.style.borderRadius = '12px';
    dialog.style.padding = '20px';
    dialog.style.width = 'min(420px, calc(100vw - 32px))';
    dialog.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.2)';

    const title = document.createElement('p');
    title.textContent = 'Voulez vous envoyer un mail pour la commande ?';
    title.style.margin = '0 0 16px';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.justifyContent = 'flex-end';
    actions.style.flexWrap = 'wrap';

    const choices = [
      { label: 'Oui', value: 'yes' },
      { label: 'Non', value: 'no' },
      { label: 'Annuler', value: 'cancel' }
    ];

    const cleanup = (value) => {
      overlay.remove();
      resolve(value);
    };

    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.className = choice.value === 'yes' ? 'btn-primary' : 'btn-secondary';
      button.addEventListener('click', () => cleanup(choice.value));
      actions.appendChild(button);
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup('cancel');
      }
    });

    dialog.appendChild(title);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}

function renderModalPhotoPreviews() {
  const container = document.getElementById('previewContainerModal');
  const count = document.getElementById('photoCountModal');
  
  if (!container || !count) return;
  
  container.innerHTML = '';
  count.textContent = editModalPhotos.length;
  
  editModalPhotos.forEach((photo, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-image';

    const img = document.createElement('img');
    img.src = photo.dataUrl || photo;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-button';
    removeBtn.textContent = 'x';

    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      editModalPhotos.splice(index, 1);
      renderModalPhotoPreviews();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    container.appendChild(wrapper);
  });
}

function formatFieldName(key) {
  const names = {
    code_produit: "Code Produit",
    quantité_consommee: 'Quantité Consommée',
    quantite_consommee: 'Quantité Consommée',
    a_commander: "À Commander",
    magasin: "Magasin",
    unites: "Unités",
    date_sortie: "Date de Sortie",
    stock_actuel: "Stock actuel",
    stock_min: "Stock min",
    stock_max: "Stock max"
  };
  return names[key] || key.replace(/_/g, ' ');
}

function exportToCSV() {
  if (filteredDocs.length === 0) {
    alert("Aucune donnée à exporter");
    return;
  }

  const headers = ["Code Produit", "Quantité Consommée", "Axe 1", "Axe 2"];
  let csvContent = "\uFEFF";
  csvContent += headers.join(";") + "\r\n";
  
  filteredDocs.forEach(doc => {
    const row = [
      doc.code_produit || '',
      doc.quantité_consommee ?? doc.quantite_consommee ?? '',
      doc.axe1 || '',
      doc.axe2 || ''
    ].map(field => {
      field = field.toString().replace(/"/g, '""');
      return field.includes(';') ? `"${field}"` : field;
    });
    
    csvContent += row.join(";") + "\r\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const magasinFilter = document.getElementById('magasinFilter').value;
  let filename = `export_stock_${new Date().toISOString().slice(0,10)}`;
  
  if (magasinFilter) {
    filename += `_${magasinFilter}`;
  }
  
  filename += '.csv';
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

function generateCSVContent() {
  const headers = ["Code Produit", "Quantité Consommée", "Axe 1", "Axe 2"];
  let csvContent = "\uFEFF";
  csvContent += headers.join(";") + "\r\n";
  
  filteredDocs.forEach(doc => {
    const row = [
      doc.code_produit || '',
      doc.quantité_consommee || '',
      doc.axe1 || '',
      doc.axe2 || ''
    ].map(field => {
      field = field.toString().replace(/"/g, '""');
      return field.includes(';') ? `"${field}"` : field;
    });
    
    csvContent += row.join(";") + "\r\n";
  });

  return csvContent;
}

function toBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}

async function exportAndSendEmail() {
  try {
    checkAuth();
    
    if (filteredDocs.length === 0) {
      alert("Aucune donnée à exporter");
      return;
    }

    const dateFilterValue = document.getElementById('dateFilter').value;
    const dateToUse = dateFilterValue ? new Date(dateFilterValue) : new Date();
    const dateStr = formatDateForFilename(dateToUse);
    const magasinFilter = document.getElementById('magasinFilter').value;
    let filename = `export_stock_${dateStr}`;
    if (magasinFilter) filename += `_${magasinFilter}`;
    filename += '.csv';

    await sendDocsToPurchasingEmail({
      docs: filteredDocs,
      filename,
      subject: `Export Stocks ${dateStr}${magasinFilter ? ` (${magasinFilter})` : ''}`,
      bodyText: 'Veuillez trouver ci-joint l\'export des stocks.'
    });

    alert(`Export envoyé avec succès: ${filename}`);
  } catch (error) {
    console.error("Erreur d'envoi:", error);
    alert(`Erreur lors de l'envoi: ${error.message}`);
  }
}

async function sendFilteredOrderEmail() {
  try {
    checkAuth();

    if (filteredDocs.length === 0) {
      alert("Aucune donnée à exporter");
      return;
    }

    const dateFilterValue = document.getElementById('dateFilter').value;
    const dateToUse = dateFilterValue ? new Date(dateFilterValue) : new Date();
    const dateStr = formatDateForFilename(dateToUse);
    const magasinFilter = document.getElementById('magasinFilter').value;
    let filename = `export_stock_${dateStr}`;
    if (magasinFilter) filename += `_${magasinFilter}`;
    filename += '.csv';

    const adminUrl = new URL('admin.html', window.location.href).toString();
    const referenceLines = filteredDocs.map((doc) => {
      const code = doc.code_produit || doc.codeproduit || 'Sans code';
      const designation = doc.designation || 'Sans designation';
      return `- ${code} | ${designation}`;
    });

    const bodyText = [
      'Veuillez trouver ci-joint les references filtrees a Oui.',
      '',
      'References filtrees a Oui :',
      ...referenceLines,
      '',
      `Lien vers l'interface d'administration : ${adminUrl}`
    ].join('\r\n');

    await sendDocsToPurchasingEmail({
      docs: filteredDocs,
      filename,
      subject: `Produits a commander ${dateStr}${magasinFilter ? ` (${magasinFilter})` : ''}`,
      bodyText
    });

    alert(`Mail de commande envoyé avec succès: ${filename}`);
  } catch (error) {
    console.error("Erreur d'envoi du mail de commande:", error);
    alert(`Erreur lors de l'envoi du mail de commande: ${error.message}`);
  }
}

function formatDateForFilename(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function chunkSplit(str, length) {
  return str.match(new RegExp(`.{1,${length}}`, 'g')).join("\r\n");
}

function loadGAPI() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts) {
      return resolve();
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      if (window.google && window.google.accounts) {
        resolve();
      } else {
        reject(new Error("L'API Google n'est pas disponible après chargement"));
      }
    };
    
    script.onerror = () => {
      reject(new Error("Échec du chargement de l'API Google Identity Services"));
    };
    
    document.body.appendChild(script);
  });
}

async function confirmDeleteSelected() {
  if (selectedDocs.size === 0) {
    alert("Aucun élément sélectionné");
    return;
  }

  if (confirm(`Voulez-vous vraiment supprimer ${selectedDocs.size} élément(s) ?`)) {
    await deleteDocs(Array.from(selectedDocs));
    selectedDocs.clear();
    loadData();
  }
}

async function confirmDeleteAll() {
  if (filteredDocs.length === 0) {
    alert("Aucun élément à supprimer");
    return;
  }

  if (confirm(`Voulez-vous vraiment supprimer TOUS les ${filteredDocs.length} éléments ?`)) {
    await deleteDocs(filteredDocs.map(doc => doc._id));
    selectedDocs.clear();
    loadData();
  }
}

async function confirmDelete(docId) {
  if (confirm("Voulez-vous vraiment supprimer cet élément ?")) {
    await deleteDocs([docId]);
    selectedDocs.delete(docId);
    loadData();
  }
}

async function deleteDocs(docIds) {
  try {
    const docs = await Promise.all(docIds.map(id => localDB.get(id)));
    const toDelete = docs.map(doc => ({ _id: doc._id, _rev: doc._rev, _deleted: true }));
    await localDB.bulkDocs(toDelete);
    alert(`${docIds.length} élément(s) supprimé(s) avec succès`);
  } catch (error) {
    console.error("Erreur lors de la suppression:", error);
    alert("Erreur lors de la suppression");
  }
}

function showDetails(docId) {
  const doc = allDocs.find(d => d._id === docId);
  if (!doc) return;
  const stockValues = getResolvedStockValues(doc);
  const displayStock = isTrackedMagasin(doc.magasin);

  let detailsHtml = `
    <div class="modal-content">
      <span class="close-btn">&times;</span>
      <h3>Détails complet</h3>
      <div class="detail-grid">
        <div class="detail-item"><strong>Date:</strong> ${formatDateForDisplay(doc._id)}</div>
        <div class="detail-item"><strong>Code Produit:</strong> ${doc.code_produit || '-'}</div>
        <div class="detail-item"><strong>Désignation:</strong> ${doc.designation || '-'}</div>
        <div class="detail-item"><strong>Quantité consommée:</strong> ${doc.quantité_consommee ?? doc.quantite_consommee ?? '-'}</div>
        <div class="detail-item"><strong>Unités:</strong> ${doc.unites || '-'}</div>
        <div class="detail-item"><strong>À commander:</strong> ${doc.a_commander || '-'}</div>
        <div class="detail-item"><strong>Remarques:</strong> ${doc.remarques || '-'}</div>
        <div class="detail-item"><strong>Magasin:</strong> ${doc.magasin || '-'}</div>
        <div class="detail-item"><strong>Date de sortie:</strong> ${doc.date_sortie ? formatDateForDisplay(doc.date_sortie) : '-'}</div>
        <div class="detail-item"><strong>Axe 1:</strong> ${getAxe1Label(doc.axe1)}</div>
        <div class="detail-item"><strong>Axe 2:</strong> ${doc.axe2 || '-'}</div>
        <div class="detail-item"><strong>Stock actuel:</strong> ${displayStock ? stockValues.stockActuel : '-'}</div>
        <div class="detail-item"><strong>Stock min:</strong> ${displayStock ? stockValues.stockMin : '-'}</div>
        <div class="detail-item"><strong>Stock max:</strong> ${displayStock ? stockValues.stockMax : '-'}</div>
  `;

  if (doc.photos) {
    const photosArray = Array.isArray(doc.photos) ? doc.photos : [doc.photos];
    
    if (photosArray.length > 0 && photosArray[0]) {
      detailsHtml += `<div class="detail-full-width"><strong>Photos:</strong></div>
        <div class="photo-gallery">`;
      
      photosArray.forEach(photo => {
        if (photo) {
          detailsHtml += `<img src="${photo}" alt="Photo stock" class="detail-photo">`;
        }
      });
      
      detailsHtml += `</div>`;
    }
  }

  detailsHtml += `</div></div>`;
  
  const modal = modalManager.openModal(detailsHtml);
  modal.querySelector('.close-btn').addEventListener('click', () => modalManager.closeCurrent());
}

function getAxe1Label(axe1) {
  const mappings = {
    'SCT=E260329': 'SCE Informations Sportives',
    'SCT=E272329': 'SCE Support Rédaction',
    'SCT=E370329': 'Maintenance Machines',
    'SCT=E382329': 'Service Rotatives',
    'SCT=E390329': 'Service Expédition',
    'SCT=E500329': 'Direction Vente',
    'SCT=E730329': 'LER Charges',
    'SCT=E736329': 'Service Travaux',
    'SCT=E760329': 'Achats Magasin',
    'SCT=E762329': 'Manutention Papier',
    'SCT=E772329': 'Coursiers',
    'SCT=E860329': 'Cantine',
    'SCT=E359329': 'SMI',
    'Admin': 'Compte Admin',
    "BOB329": "Bobines"
  };
  
  return mappings[axe1] || axe1;
}

async function logout() {
  try {
    await fetch(`${COUCHDB_BASE_URL}/_session`, {
      method: "DELETE",
      credentials: "include"
    });
  } catch (error) {
    console.error("Erreur de déconnexion CouchDB :", error);
  } finally {
    clearClientSession();
    window.location.href = "login.html";
  }
}

// ATTACHE l'event sur bouton (DOIT être dans setupEventListeners si existant)
document.getElementById('exportXlsxBobinesBtn').addEventListener('click', exportAndSendXlsxBobines);

// Fonction export Excel & envoi mail google pour bobines uniquement
async function exportAndSendXlsxBobines() {
  try {
    checkAuth();

    // Filtre bobines (type 'bobine')
    const bobinesDocs = filteredDocs.filter(doc => doc.type === 'bobine');
    if (!bobinesDocs.length) {
      alert("Aucune donnée à exporter.");
      return;
    }

    await loadGAPI();

    const data = bobinesDocs.map(b => ({
      "Code barre": b.code_produit || b.codeproduit || "",
      "Remarque": b.remarques || ""
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: ["Code barre", "Remarque"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "bobines");

    const wbout = XLSX.write(wb, {bookType:"xlsx", type:"base64"});
    
    // MODIFICATION ICI : Utiliser la date sélectionnée dans le calendrier au lieu de la date du jour
    const dateFilterValue = document.getElementById('dateFilter').value;
    let dateToUse;
    
    if (dateFilterValue) {
      // Si une date est sélectionnée, l'utiliser
      dateToUse = new Date(dateFilterValue);
    } else {
      // Sinon, utiliser la date du jour
      dateToUse = new Date();
    }
    
    const dateStr = formatDateForFilename(dateToUse);
    const filename = `bobines_export_${dateStr}.xlsx`;

    const boundary = "----boundary_" + Math.random().toString(16).substr(2);
    const nl = "\r\n";
    const mimeParts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Veuillez trouver ci-joint l\'export Excel des codes barre bobines (code barre + remarque).',
      '',
      `--${boundary}`,
      'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      chunkSplit(wbout, 76),
      ''
    ];

    // Ajouter les photos comme pièces jointes
    let photoIndex = 1;
    for (const doc of bobinesDocs) {
      if (doc.photos && Array.isArray(doc.photos)) {
        // Récupérer le code produit pour cette bobine spécifique
        const codeProduit = doc.code_produit || doc.codeproduit || "sans-code";
        
        for (const photo of doc.photos) {
          if (photo) {
            // Extraire le base64 si c'est une data URL
            const base64Data = photo.startsWith('data:image') ? photo.split(',')[1] : photo;
            const imageExt = photo.includes('jpeg') || photo.includes('jpg') ? 'jpg' : 'png';
            
            // Nouveau format de nom : photo_[index]_[code_produit].[extension]
            const photoFilename = `photo_${photoIndex}_numero-bobine_${codeProduit}.${imageExt}`;
            
            mimeParts.push(`--${boundary}`);
            mimeParts.push(`Content-Type: image/${imageExt}`);
            mimeParts.push(`Content-Disposition: attachment; filename="${photoFilename}"`);
            mimeParts.push('Content-Transfer-Encoding: base64');
            mimeParts.push('');
            mimeParts.push(chunkSplit(base64Data, 76));
            mimeParts.push('');
            
            photoIndex++;
          }
        }
      }
    }

    mimeParts.push(`--${boundary}--`);

    const rawMessage = [
      `To: ervachats@ervmedia.fr`,
      `Subject: Export Excel Bobines ${dateStr}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      ...mimeParts
    ].join(nl);

    const encodedMessage = toBase64(rawMessage)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const client = google.accounts.oauth2.initTokenClient({
      client_id: '283743756981-c3dp88fodaudspddumurobveupvhll7e.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      callback: async (tokenResponse) => {
        try {
          if (tokenResponse.error) throw new Error(tokenResponse.error);

          const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenResponse.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedMessage })
          });

          if (!response.ok) throw new Error(await response.text());
          alert(`Export Excel Bobines envoyé par mail avec succès : ${filename}`);
        } catch (error) {
          alert(`Erreur lors de l'envoi: ${error.message}`);
        }
      },
      error_callback: (error) => {
        alert("Erreur d'authentification Google");
      }
    });
    client.requestAccessToken();

  } catch (e) {
    alert("Erreur lors de l'export Excel Bobines: " + e.message);
  }
}
function toBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}
function chunkSplit(str, length) {
  return str.match(new RegExp(`.{1,${length}}`, 'g')).join("\r\n");
}





js/admin.js
