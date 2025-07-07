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

// Initialisation
document.addEventListener("DOMContentLoaded", initAdmin);

function initAdmin() {
  checkAuth();
  setupEventListeners();
  loadData();
}

function checkAuth() {
  if (!sessionStorage.getItem('currentAccount')) {
    window.location.href = 'login.html';
  }
}

function setupEventListeners() {
  // Boutons
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('syncBtn').addEventListener('click', syncWithServer);
  document.getElementById('deleteSelectedBtn').addEventListener('click', confirmDeleteSelected);
  document.getElementById('deleteAllBtn').addEventListener('click', confirmDeleteAll);
  
  // Recherche/filtre
  document.getElementById('searchInput').addEventListener('input', filterData);
  document.getElementById('searchBtn').addEventListener('click', filterData);
  document.getElementById('filterSelect').addEventListener('change', filterData);
  
  // Pagination
  document.getElementById('firstPageBtn').addEventListener('click', () => goToPage(1));
  document.getElementById('prevPageBtn').addEventListener('click', () => goToPage(currentPage - 1));
  document.getElementById('nextPageBtn').addEventListener('click', () => goToPage(currentPage + 1));
  document.getElementById('lastPageBtn').addEventListener('click', () => goToPage(totalPages));
  
  // Sélection
  document.getElementById('selectAll').addEventListener('change', toggleSelectAll);
  
  // Modal
  document.querySelector('.close-btn').addEventListener('click', closeModal);
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

  filteredDocs = allDocs.filter(doc => {
    // Filtre par compte
    if (filterValue && doc.axe1 !== filterValue) return false;
    
    // Filtre par recherche
    if (searchTerm) {
      return (
        (doc.code_produit && doc.code_produit.toLowerCase().includes(searchTerm)) ||
        (doc.designation && doc.designation.toLowerCase().includes(searchTerm)) ||
        (doc.axe2 && doc.axe2.toLowerCase().includes(searchTerm))
      );
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
      <td>${doc.designation || ''}</td>
      <td>${doc.quantité_consommee || ''} ${doc.unites || ''}</td>
      <td>${getAxe1Label(doc.axe1)}</td>
      <td>${doc.axe2 || ''}</td>
      <td>
        <button class="view-btn" data-id="${doc._id}">👁️</button>
        <button class="delete-btn" data-id="${doc._id}">🗑️</button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  // Écouteurs pour les cases à cocher
  document.querySelectorAll('.row-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const docId = e.target.dataset.id;
      if (e.target.checked) {
        selectedDocs.add(docId);
      } else {
        selectedDocs.delete(docId);
      }
      updateSelectedCount();
      updateSelectAllCheckbox();
    });
  });

  // Écouteurs pour les boutons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => showDetails(e.target.dataset.id));
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => confirmDelete(e.target.dataset.id));
  });

  updatePagination();
}

function updateStats() {
  document.getElementById('totalCount').textContent = allDocs.length;
  document.getElementById('rotativesCount').textContent = allDocs.filter(d => d.axe1 === 'SCT=E382329').length;
  document.getElementById('expeditionCount').textContent = allDocs.filter(d => d.axe1 !== 'SCT=E382329').length;
  updateSelectedCount();
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
  
  // Contrôles de pagination
  document.getElementById('firstPageBtn').disabled = currentPage === 1;
  document.getElementById('prevPageBtn').disabled = currentPage === 1;
  document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
  document.getElementById('lastPageBtn').disabled = currentPage === totalPages;
  
  // Numéros de page
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

// Fonctions de gestion des données
async function syncWithServer() {
  try {
    await localDB.sync(remoteDB);
    alert("Synchronisation réussie");
    loadData();
  } catch (error) {
    console.error("Erreur de synchronisation:", error);
    alert("Erreur lors de la synchronisation");
  }
}

function exportToCSV() {
  if (filteredDocs.length === 0) {
    alert("Aucune donnée à exporter");
    return;
  }

  const headers = [
    "Code Produit", "Quantité Consommée", 
    "Axe 1", "Axe 2", "Date"
  ];
  
  const csvContent = [
    headers.join(";"),
    ...filteredDocs.map(doc => [
      doc.code_produit || '',
      doc.quantité_consommee || '',
      doc.axe1,
      doc.axe2 || '',
      formatDate(doc._id)
    ].join(";"))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `export_stock_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

// Fonctions d'affichage
function showDetails(docId) {
  const doc = allDocs.find(d => d._id === docId);
  if (!doc) return;

  let detailsHtml = `
    <h3>Détails complet</h3>
    <div class="detail-grid">
      <div class="detail-item"><strong>Date:</strong> ${formatDate(doc._id)}</div>
      <div class="detail-item"><strong>Code Produit:</strong> ${doc.code_produit || '-'}</div>
      <div class="detail-item"><strong>Désignation:</strong> ${doc.designation || '-'}</div>
      <div class="detail-item"><strong>Quantité consommée:</strong> ${doc.quantité_consommee || '-'} ${doc.unites || ''}</div>
      <div class="detail-item"><strong>À commander:</strong> ${doc.a_commander || '-'}</div>
      <div class="detail-item"><strong>Remarques:</strong> ${doc.remarques || '-'}</div>
      <div class="detail-item"><strong>Magasin:</strong> ${doc.magasin || '-'}</div>
      <div class="detail-item"><strong>Stock initial:</strong> ${doc.stock_initial || '-'}</div>
      <div class="detail-item"><strong>Stock final:</strong> ${doc.stock_final || '-'}</div>
      <div class="detail-item"><strong>Axe 1:</strong> ${getAxe1Label(doc.axe1)}</div>
      <div class="detail-item"><strong>Axe 2:</strong> ${doc.axe2 || '-'}</div>
  `;

  if (doc.photos?.length > 0) {
    detailsHtml += `<div class="detail-full-width"><strong>Photos:</strong></div>
      <div class="photo-gallery">`;
    doc.photos.forEach(photo => {
      detailsHtml += `<img src="${photo}" alt="Photo stock" class="detail-photo">`;
    });
    detailsHtml += `</div>`;
  }

  document.getElementById('modalContent').innerHTML = detailsHtml;
  document.getElementById('detailsModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('detailsModal').style.display = 'none';
}

// Fonctions utilitaires
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getAxe1Label(axe1) {
  return axe1 === 'SCT=E382329' ? 'Rotatives' : 'Expédition';
}

function logout() {
  sessionStorage.removeItem('currentAccount');
  window.location.href = 'login.html';
}