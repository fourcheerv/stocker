// Configuration de la base de données
const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");

// Variables globales
let allDocs = [];
let filteredDocs = [];
let currentPage = 1;
const itemsPerPage = 10;
let totalPages = 1;
let selectedDocs = new Set();

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

// Initialisation
document.addEventListener("DOMContentLoaded", initAdmin);

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initAdmin() {
  checkAuth();
  setupEventListeners();
  
  const currentAccount = sessionStorage.getItem('currentAccount');
  if (currentAccount) {
    document.getElementById('currentUserLabel').textContent = getAxe1Label(currentAccount);
  } else {
    window.location.href = 'login.html';
  }
  
  document.getElementById('dateFilter').value = getTodayDate();
  loadData();
}

function checkAuth() {
  if (!sessionStorage.getItem('currentAccount')) {
    window.location.href = 'login.html';
  }
}

function setupEventListeners() {
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('syncBtn').addEventListener('click', syncWithServer);
  document.getElementById('deleteSelectedBtn').addEventListener('click', confirmDeleteSelected);
  document.getElementById('deleteAllBtn').addEventListener('click', confirmDeleteAll);
  document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);

  document.getElementById('searchInput').addEventListener('input', function() {
    currentPage = 1;
    filterData();
  });
  
  document.getElementById('filterSelect').addEventListener('change', function() {
    currentPage = 1;
    filterData();
  });
  
  document.getElementById('dateFilter').addEventListener('change', function() {
    currentPage = 1;
    filterData();
  });
  
  document.getElementById('commandeFilter').addEventListener('change', function() {
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
  document.getElementById('dateFilter').value = getTodayDate();
  document.getElementById('commandeFilter').value = '';
  currentPage = 1;
  filterData();
}

async function loadData() {
  try {
    const result = await localDB.allDocs({ include_docs: true });
    allDocs = result.rows
      .map(row => row.doc)
      .filter(doc => !doc._id.startsWith('_design'))
      .sort((a, b) => new Date(b._id) - new Date(a._id));
    
    filterData();
  } catch (error) {
    console.error("Erreur lors du chargement:", error);
    alert("Erreur lors du chargement des données");
  }
}

function filterData() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filterValue = document.getElementById('filterSelect').value;
  const dateFilter = document.getElementById('dateFilter').value;
  const commandeFilter = document.getElementById('commandeFilter').value;

  filteredDocs = allDocs.filter(doc => {
    if (filterValue && doc.axe1 !== filterValue) return false;
    
    if (dateFilter) {
      const docDate = new Date(doc._id).toISOString().split('T')[0];
      const selectedDate = new Date(dateFilter).toISOString().split('T')[0];
      if (docDate !== selectedDate) return false;
    }
    
    if (commandeFilter) {
      const aCommander = doc.a_commander ? doc.a_commander.toLowerCase() : '';
      if (commandeFilter === 'oui' && !aCommander.includes('oui')) return false;
      if (commandeFilter === 'non' && aCommander.includes('oui')) return false;
    }
    
    if (searchTerm) {
      const matchesCode = doc.code_produit && doc.code_produit.toLowerCase().includes(searchTerm);
      const matchesDesignation = doc.designation && doc.designation.toLowerCase().includes(searchTerm);
      const matchesAxe2 = doc.axe2 && doc.axe2.toLowerCase().includes(searchTerm);
      const matchesRemarques = doc.remarques && doc.remarques.toLowerCase().includes(searchTerm);
      
      if (!(matchesCode || matchesDesignation || matchesAxe2 || matchesRemarques)) {
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

  totalPages = Math.ceil(filteredDocs.length / itemsPerPage);
  currentPage = Math.min(currentPage, totalPages);
  
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDocs = filteredDocs.slice(startIndex, startIndex + itemsPerPage);

  paginatedDocs.forEach(doc => {
    const row = document.createElement('tr');
    const isSelected = selectedDocs.has(doc._id);
    
    row.innerHTML = `
      <td><input type="checkbox" class="row-checkbox" data-id="${doc._id}" ${isSelected ? 'checked' : ''}></td>
      <td>${formatDate(doc._id)}</td>
      <td>${doc.code_produit || ''}</td>
      <td class="designation-cell">${doc.designation || ''}</td>
      <td>${doc.quantité_consommee || ''}</td>
      <td>${doc.unites || ''}</td>
      <td>${doc.a_commander || ''}</td>
      <td>${doc.magasin || ''}</td>
      <td>${doc.stock_initial || ''}</td>
      <td>${doc.stock_final || ''}</td>
      <td>${getAxe1Label(doc.axe1)}</td>
      <td>${doc.axe2 || ''}</td>
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

  const dateFilter = document.getElementById('dateFilter').value;
  if (dateFilter) {
    document.getElementById('dateFilter').classList.add('active-filter');
  } else {
    document.getElementById('dateFilter').classList.remove('active-filter');
  }

  updatePagination();
}

function formatDate(isoString) {
  if (!isoString) return '';
  
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
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
    'NEUTRE': 'Compte Invite'
  };
  
  return mappings[axe1] || axe1;
}

function logout() {
  sessionStorage.removeItem('currentAccount');
  window.location.href = 'login.html';
}