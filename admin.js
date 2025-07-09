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
  document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    closeAllModals();
    showDetails(e.target.dataset.id);
  });
});
  
  document.addEventListener('click', function(e) {
  if (e.target.classList.contains('edit-btn')) {
    const docId = e.target.dataset.id;
    const doc = allDocs.find(d => d._id === docId);
    if (doc) setupEditModal(doc);
  }
});
 
  // Recherche/filtre
  document.getElementById('searchInput').addEventListener('input', filterData);
  document.getElementById('searchBtn').addEventListener('click', filterData);
  document.getElementById('filterSelect').addEventListener('change', filterData);
  document.getElementById('dateFilter').addEventListener('change', filterData);
  document.getElementById('commandeFilter').addEventListener('change', filterData);
  document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);

  function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterSelect').value = '';
  document.getElementById('dateFilter').value = '';
  document.getElementById('commandeFilter').value = '';
  filterData();
  }
  
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
  const dateFilter = document.getElementById('dateFilter').value;
  const commandeFilter = document.getElementById('commandeFilter').value;

  filteredDocs = allDocs.filter(doc => {
    // Filtre par compte
    if (filterValue && doc.axe1 !== filterValue) return false;
    
    // Filtre par date
    if (dateFilter) {
      const docDate = new Date(doc._id).toISOString().split('T')[0];
      if (docDate !== dateFilter) return false;
    }
    
    // Filtre "À commander"
    if (commandeFilter) {
      const aCommander = doc.a_commander ? doc.a_commander.toLowerCase() : '';
      if (commandeFilter === 'oui' && !aCommander.includes('oui')) return false;
      if (commandeFilter === 'non' && aCommander.includes('oui')) return false;
    }
    
    // Filtre par recherche
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
      <td>${doc.designation || ''}</td>
      <td>${doc.quantité_consommee || ''}</td>
      <td>${doc.unites || ''}</td>
      <td>${doc.a_commander || ''}</td>
      <td>${doc.magasin || ''}</td>
      <td>${doc.stock_initial || ''}</td>
      <td>${doc.stock_final || ''}</td>
      <td>${getAxe1Label(doc.axe1)}</td>
      <td>${doc.axe2 || ''}</td>
      <td>
        <button class="view-btn" data-id="${doc._id}">👁️</button>
        <button class="edit-btn" data-id="${doc._id}">✏️</button>
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

// Ajoutez ces nouvelles fonctions :

function setupEditModal(doc) {
  // Ferme la modal de visualisation si elle est ouverte
  closeModal();
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'editModal';
  modal.innerHTML = `
    <div class="edit-modal-content">
      <span class="close-btn">&times;</span>
      <h2>Modifier l'entrée</h2>
      <form id="editForm">
        ${generateEditFields(doc)}
      </form>
      <div class="modal-actions">
        <button id="saveEditBtn" class="btn-primary">Enregistrer</button>
        <button id="cancelEditBtn" class="btn-secondary">Annuler</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'flex';

  // Gestion de la fermeture
  modal.querySelector('.close-btn').addEventListener('click', () => {
    modal.remove();
  });
  
  modal.querySelector('#cancelEditBtn').addEventListener('click', () => {
    modal.remove();
  });

  // Gestion de la sauvegarde
  modal.querySelector('#saveEditBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await saveEditedDoc(doc._id);
    modal.remove();
  });
}

// Début édition
function generateEditFields(doc) {
  let fields = '';
  const excludedFields = ['_id', '_rev', 'axe1']; // Champs non modifiables
  
  for (const [key, value] of Object.entries(doc)) {
    if (excludedFields.includes(key) || key.startsWith('_')) continue;
    
    fields += `
      <div class="form-group">
        <label for="edit_${key}">${formatFieldName(key)}:</label>
        ${getInputField(key, value)}
      </div>
    `;
  }
  
  return fields;
}

function getInputField(key, value) {
  if (key === 'a_commander') {
    return `
      <select id="edit_${key}" class="form-control">
        <option value="Oui" ${value === 'Oui' ? 'selected' : ''}>Oui</option>
        <option value="Non" ${value === 'Non' ? 'selected' : ''}>Non</option>
      </select>
    `;
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
      doc[key] = input.type === 'number' ? parseFloat(input.value) : input.value;
    });
    
    await localDB.put(doc);
    alert('Modifications enregistrées avec succès');
    loadData(); // Rafraîchit les données
  } catch (error) {
    console.error("Erreur lors de la mise à jour:", error);
    alert("Erreur lors de la mise à jour");
  }
}

function formatFieldName(key) {
  // Convertit les noms de champs en libellés lisibles
  const names = {
    code_produit: "Code Produit",
    quantité_consommee: "Quantité Consommée",
    a_commander: "À Commander",
    // Ajoutez d'autres conversions si nécessaire
  };
  return names[key] || key.replace(/_/g, ' ');
}

//fin édition


function exportToCSV() {
  if (filteredDocs.length === 0) {
    alert("Aucune donnée à exporter");
    return;
  }

  // 1. Génération du CSV
  const headers = ["Code Produit", "Quantité Consommée", "Axe 1", "Axe 2"];
  let csvContent = headers.join(";") + "\r\n";
  
  filteredDocs.forEach(doc => {
    csvContent += [
      doc.code_produit || '',
      doc.quantité_consommee || '',
      doc.axe1 || '',
      doc.axe2 || ''
    ].join(";") + "\r\n";
  });

  // 2. Création du fichier
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const filename = `export_stock_${new Date().toISOString().slice(0,10)}.csv`;

  // 3. Solution pour Android/Chrome
  if (navigator.userAgent.includes('Android') && navigator.userAgent.includes('Chrome')) {
    const link = document.createElement('a');
    link.href = `intent://send?to=spokorski@gmail.com,sebastien.pokorski@estrepublicain.fr&subject=Export des stocks&body=Ci-joint l'export des stocks#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.STREAM=${url};end`;
    link.click();
    setTimeout(() => {
      // Fallback si l'intent échoue
      downloadFile(url, filename);
    }, 300);
    return;
  }

  // 4. Fallback standard
  downloadFile(url, filename);
  setTimeout(() => {
    window.open(`mailto:spokorski@gmail.com,sebastien.pokorski@estrepublicain.fr?subject=Export des stocks&body=Merci de trouver ci-joint l'export des stocks (fichier téléchargé automatiquement)`);
  }, 500);
}

function downloadFile(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
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
  // Ferme la modal d'édition si elle est ouverte
  const editModal = document.getElementById('editModal');
  if (editModal) editModal.remove();
  const doc = allDocs.find(d => d._id === docId);
  if (!doc) return;

  let detailsHtml = `
    <h3>Détails complet</h3>
    <div class="detail-grid">
      <div class="detail-item"><strong>Date:</strong> ${formatDate(doc._id)}</div>
      <div class="detail-item"><strong>Code Produit:</strong> ${doc.code_produit || '-'}</div>
      <div class="detail-item"><strong>Désignation:</strong> ${doc.designation || '-'}</div>
      <div class="detail-item"><strong>Quantité consommée:</strong> ${doc.quantité_consommee || '-'}</div>
      <div class="detail-item"><strong>Unités:</strong> ${doc.unites || '-'}</div>
      <div class="detail-item"><strong>À commander:</strong> ${doc.a_commander || '-'}</div>
      <div class="detail-item"><strong>Remarques:</strong> ${doc.remarques || '-'}</div>
      <div class="detail-item"><strong>Magasin:</strong> ${doc.magasin || '-'}</div>
      <div class="detail-item"><strong>Stock initial:</strong> ${doc.stock_initial || '-'}</div>
      <div class="detail-item"><strong>Stock final:</strong> ${doc.stock_final || '-'}</div>
      <div class="detail-item"><strong>Seuil de commande:</strong> ${doc.seuil_de_commande || '-'}</div>
      <div class="detail-item"><strong>Section employeur:</strong> ${doc.section_employeur || '-'}</div>
      <div class="detail-item"><strong>Emplacement de stockage:</strong> ${doc.emplacement_de_stockage || '-'}</div>
      <div class="detail-item"><strong>Quantité en stock:</strong> ${doc.quantite_en_stock || '-'}</div>
      <div class="detail-item"><strong>Quantité théorique:</strong> ${doc.quantite_theorique || '-'}</div>
      <div class="detail-item"><strong>Date de sortie:</strong> ${doc.date_sortie ? formatDate(doc.date_sortie) : '-'}</div>
      <div class="detail-item"><strong>Axe 1:</strong> ${getAxe1Label(doc.axe1)}</div>
      <div class="detail-item"><strong>Axe 2:</strong> ${doc.axe2 || '-'}</div>
  `;

// Gestion sécurisée des photos
  if (doc.photos) {
    // Vérifie si c'est un tableau ou une chaîne unique
    const photosArray = Array.isArray(doc.photos) ? doc.photos : [doc.photos];
    
    if (photosArray.length > 0 && photosArray[0]) { // Vérifie qu'il y a au moins une photo non vide
      detailsHtml += `<div class="detail-full-width"><strong>Photos:</strong></div>
        <div class="photo-gallery">`;
      
      photosArray.forEach(photo => {
        if (photo) { // Vérifie que la photo existe
          detailsHtml += `<img src="${photo}" alt="Photo stock" class="detail-photo">`;
        }
      });
      
      detailsHtml += `</div>`;
    }
  }

  document.getElementById('modalContent').innerHTML = detailsHtml;
  document.getElementById('detailsModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('detailsModal').style.display = 'none';
}

function closeAllModals() {
  const detailsModal = document.getElementById('detailsModal');
  if (detailsModal) detailsModal.style.display = 'none';
  
  const editModal = document.getElementById('editModal');
  if (editModal) editModal.remove();
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