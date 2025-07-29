// Configuration PouchDB améliorée
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

// À placer juste après le DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  // Solution radicale (bypass)
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  
  document.getElementById('dateFilter').value = `${year}-${month}-${day}`;
  initAdmin();
});


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

  // Afficher le nom utilisateur
  const currentAccount = sessionStorage.getItem('currentAccount');
  if (currentAccount) {
    document.getElementById('currentUserLabel').textContent = getAxe1Label(currentAccount);
  }

  // Initialiser le filtre date avec la date du jour
  document.getElementById('dateFilter').value = getTodayDate();
  
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
  document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
  document.getElementById('exportToDriveBtn').addEventListener('click', exportAndSendEmail);

  // Recherche/filtres
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
    document.getElementById('magasinFilter').addEventListener('change', function() {
    currentPage = 1;
    filterData();
  });

  // Pagination
  document.getElementById('firstPageBtn').addEventListener('click', () => goToPage(1));
  document.getElementById('prevPageBtn').addEventListener('click', () => goToPage(currentPage - 1));
  document.getElementById('nextPageBtn').addEventListener('click', () => goToPage(currentPage + 1));
  document.getElementById('lastPageBtn').addEventListener('click', () => goToPage(totalPages));
  
  // Sélection
  document.getElementById('selectAll').addEventListener('change', toggleSelectAll);

  // Délégation d'événements pour le tableau
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
  document.getElementById('dateFilter').value = getTodayDate(); // Réinitialise à la date du jour
  document.getElementById('commandeFilter').value = '';
  document.getElementById('magasinFilter').value = '';
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
  const magasinFilter = document.getElementById('magasinFilter').value;

  filteredDocs = allDocs.filter(doc => {
    // Filtre par compte
    if (filterValue && doc.axe1 !== filterValue) return false;
    
    // Filtre par date de sortie (modifié)
    if (dateFilter) {
      // Si le document a une date de sortie, on la compare
      if (doc.date_sortie) {
        const docDate = new Date(doc.date_sortie);
        const filterDate = new Date(dateFilter);
        
        const docDateNormalized = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());
        const filterDateNormalized = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
        
        if (docDateNormalized.getTime() !== filterDateNormalized.getTime()) {
          return false;
        }
      } 
      // Si le document n'a pas de date de sortie mais qu'un filtre date est appliqué, on l'exclut
      else {
        return false;
      }
    }
    
    // ... (le reste de la fonction reste inchangé)
    // Filtre "À commander"
    if (commandeFilter) {
      const aCommander = doc.a_commander ? doc.a_commander.toLowerCase() : '';
      if (commandeFilter === 'oui' && !aCommander.includes('oui')) return false;
      if (commandeFilter === 'non' && aCommander.includes('oui')) return false;
    }

    // Filtre "Magasin"
    if (magasinFilter) {
      const magasin = doc.magasin ? doc.magasin : '';
      if (magasinFilter === 'ER-MG' && magasin !== 'ER-MG') return false;
      if (magasinFilter === 'ER-MP' && magasin !== 'ER-MP') return false;
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
      <td>${doc.date_sortie ? formatDate(doc.date_sortie) : formatDate(doc._id)}</td>
      <td>${doc.code_produit || ''}</td>
      <td class="designation-cell" title="${doc.designation || ''}">${doc.designation || ''}</td>
      <td>${doc.quantité_consommee || ''}</td>
      <td>${doc.unites || ''}</td>
      <td>${doc.a_commander || ''}</td>
      <td>${doc.magasin || ''}</td>
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

function setupEditModal(doc) {
  const modalContent = `
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
  
  const modal = modalManager.openModal(modalContent, true);

  // Gestion de la fermeture
  modal.querySelector('.close-btn').addEventListener('click', () => {
    modalManager.closeCurrent();
  });
  
  modal.querySelector('#cancelEditBtn').addEventListener('click', () => {
    modalManager.closeCurrent();
  });

  // Gestion de la sauvegarde
  modal.querySelector('#saveEditBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await saveEditedDoc(doc._id);
    modalManager.closeCurrent();
  });
}

function generateEditFields(doc) {
  let fields = '';
  const excludedFields = ['_id', '_rev', 'axe1'];
  
  for (const [key, value] of Object.entries(doc)) {
    if (excludedFields.includes(key) || key.startsWith('_')) continue;
    
    fields += `
      <div class="form-group">
        <label for="edit_${key}">${formatFieldName(key)}:</label>
        ${key === 'date_sortie' 
          ? `<input type="text" id="edit_${key}" class="form-control" value="${formatDate(value)}" readonly>` 
          : getInputField(key, value)
        }
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
    loadData();
  } catch (error) {
    console.error("Erreur lors de la mise à jour:", error);
    alert("Erreur lors de la mise à jour");
  }
}

function formatFieldName(key) {
  const names = {
    code_produit: "Code Produit",
    quantité_consommee: "Quantité Consommée",
    a_commander: "À Commander",
    magasin: "Magasin",
    unites: "Unités",
    date_sortie: "Date de Sortie"
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
      doc.quantité_consommee || '',
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
  
  // Récupérer la valeur du filtre magasin
  const magasinFilter = document.getElementById('magasinFilter').value;
  
  // Créer le nom du fichier avec la date et le filtre magasin si applicable
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
  let csvContent = "\uFEFF"; // BOM pour UTF-8
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
  // Solution universelle pour encoder en base64 avec support Unicode
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

    await loadGAPI();
    
    const client = google.accounts.oauth2.initTokenClient({
      client_id: '283743756981-c3dp88fodaudspddumurobveupvhll7e.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      callback: async (tokenResponse) => {
        try {
          if (tokenResponse.error) throw new Error(tokenResponse.error);
          
          // 1. Générer le contenu CSV
          const csvContent = generateCSVContent();
          
          // 2. Préparer le nom du fichier
          const today = new Date();
          const dateStr = formatDateForFilename(today);
          const magasinFilter = document.getElementById('magasinFilter').value;
          let filename = `export_stock_${dateStr}`;
          if (magasinFilter) filename += `_${magasinFilter}`;
          filename += '.csv';

          // 3. Construire le message MIME
          const boundary = "----boundary_" + Math.random().toString(16).substr(2);
          const nl = "\r\n";
          
          const mimeParts = [
            // Partie texte
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
            '',
            'Veuillez trouver ci-joint l\'export des stocks.',
            '',
            // Partie pièce jointe
            `--${boundary}`,
            'Content-Type: text/csv; charset=UTF-8',
            `Content-Disposition: attachment; filename="${filename}"`,
            'Content-Transfer-Encoding: base64',
            '',
            chunkSplit(toBase64(csvContent), 76), // Découpage en lignes de 76 caractères
            '',
            `--${boundary}--`
          ];

          const rawMessage = [
            `To: sebastien.pokorski@estrepublicain.fr`,
            `Subject: Export Stocks ${dateStr}${magasinFilter ? ` (${magasinFilter})` : ''}`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            '',
            ...mimeParts
          ].join(nl);

          // 4. Encoder le message complet
          const encodedMessage = toBase64(rawMessage)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          // 5. Envoyer via l'API Gmail
          const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenResponse.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedMessage })
          });

          if (!response.ok) throw new Error(await response.text());
          alert(`Export envoyé avec succès: ${filename}`);
        } catch (error) {
          console.error("Erreur d'envoi:", error);
          alert(`Erreur lors de l'envoi: ${error.message}`);
        }
      },
      error_callback: (error) => {
        console.error("Erreur OAuth:", error);
        alert("Erreur d'authentification Google");
      }
    });

    client.requestAccessToken();
  } catch (error) {
    console.error("Erreur initiale:", error);
    alert(`Erreur: ${error.message}`);
  }
}

// Fonctions utilitaires supplémentaires
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


// Fonction utilitaire pour charger l'API Google
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
        console.log("Google Identity Services chargé");
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

  let detailsHtml = `
    <div class="modal-content">
      <span class="close-btn">&times;</span>
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
        <div class="detail-item"><strong>Date de sortie:</strong> ${doc.date_sortie ? formatDate(doc.date_sortie) : '-'}</div>
        <div class="detail-item"><strong>Axe 1:</strong> ${getAxe1Label(doc.axe1)}</div>
        <div class="detail-item"><strong>Axe 2:</strong> ${doc.axe2 || '-'}</div>
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

// Fonctions utilitaires (ajout de la gestion du format ISO/fr-FR)
function formatDate(isoString) {
  if (!isoString) return '';
  
  // Si la date est déjà au format français (ex: "10/07/2025"), ne pas la reconvertir
  if (isoString.includes('/')) return isoString;
  
  // Convertir l'ISO en format français
  const date = new Date(isoString);
  return date.toLocaleDateString('fr-FR', {
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
    'SCT=E359329': 'SMI',
    'Admin': 'Compte Admin'
  };
  
  return mappings[axe1] || axe1;
}

function logout() {
  sessionStorage.removeItem('currentAccount');
  window.location.href = 'login.html';
}
