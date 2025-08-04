// Configuration PouchDB
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

// Fonctions utilitaires pour la gestion des dates
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

// Initialisation
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  document.getElementById('dateFilter').value = today.toISOString().split('T')[0];
  initAdmin();
});

function initAdmin() {
  checkAuth();
  setupEventListeners();

  const currentAccount = sessionStorage.getItem('currentAccount');
  const currentServiceName = sessionStorage.getItem('currentServiceName');
  
  if (currentAccount) {
    document.getElementById('currentUserLabel').textContent = currentServiceName || getAxe1Label(currentAccount);
    applyAccountFilter(currentAccount);
  }

  loadData();
}

function checkAuth() {
  const currentAccount = sessionStorage.getItem('currentAccount');
  if (!currentAccount) {
    window.location.href = 'login.html';
    return;
  }

  // Redirection si non-admin sur admin.html
  if (currentAccount !== 'Admin' && window.location.pathname.endsWith('admin.html')) {
    window.location.href = 'index.html';
  }
}

function applyAccountFilter(account) {
  const filterSelect = document.getElementById('filterSelect');
  const currentServiceLabel = document.getElementById('currentServiceLabel');
  const urlParams = new URLSearchParams(window.location.search);
  const fromIndex = urlParams.get('fromIndex');

  if (fromIndex === 'true') {
    // Forcer le filtre du compte utilisateur quand on vient de index.html
    filterSelect.value = account;
    filterSelect.disabled = true;
    currentServiceLabel.textContent = `Mes enregistrements (${getAxe1Label(account)})`;
  } else if (account === 'Admin') {
    // Comportement normal pour l'admin
    filterSelect.disabled = false;
    filterSelect.value = '';
    currentServiceLabel.textContent = 'Tous les comptes (mode Admin)';
  } else {
    // Comportement normal pour les autres utilisateurs
    filterSelect.value = account;
    filterSelect.disabled = true;
    currentServiceLabel.textContent = getAxe1Label(account);
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
    'SCT=E359329': 'SMI',
    'Admin': 'Compte Admin'
  };
  
  return mappings[axe1] || axe1;
}

function setupEventListeners() {
  // Ajout du bouton Retour
  const backBtn = document.createElement('button');
  backBtn.id = 'backBtn';
  backBtn.textContent = 'Retour';
  backBtn.className = 'btn-secondary';
  backBtn.style.marginRight = '10px';
  
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn.parentNode.insertBefore(backBtn, logoutBtn);
  
  backBtn.addEventListener('click', () => {
    const currentAccount = sessionStorage.getItem('currentAccount');
    if (currentAccount && currentAccount !== 'Admin') {
      window.location.href = 'index.html';
    } else {
      window.location.href = 'login.html';
    }
  });
  
  if (sessionStorage.getItem('currentAccount') === 'Admin') {
    backBtn.style.display = 'none';
  }
  
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
  
  document.getElementById('commandeFilter').addEventListener('change', () => {
    currentPage = 1;
    filterData();
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
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const filterValue = document.getElementById('filterSelect').value;
  const dateFilterValue = document.getElementById('dateFilter').value;
  const commandeFilter = document.getElementById('commandeFilter').value;
  const magasinFilter = document.getElementById('magasinFilter').value;

  filteredDocs = allDocs.filter(doc => {
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
      const aCommander = doc.a_commander ? doc.a_commander.toString().trim().toLowerCase() : '';
      
      if (commandeFilter === 'oui' && !['oui', 'o', 'yes', 'y'].includes(aCommander)) {
        return false;
      }
      if (commandeFilter === 'non' && ['oui', 'o', 'yes', 'y'].includes(aCommander)) {
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

  totalPages = Math.ceil(filteredDocs.length / itemsPerPage);
  currentPage = Math.min(currentPage, totalPages);
  
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDocs = filteredDocs.slice(startIndex, startIndex + itemsPerPage);

  paginatedDocs.forEach(doc => {
    const row = document.createElement('tr');
    const isSelected = selectedDocs.has(doc._id);
    
    row.innerHTML = `
      <td><input type="checkbox" class="row-checkbox" data-id="${doc._id}" ${isSelected ? 'checked' : ''}></td>
      <td>${doc.date_sortie ? formatDateForDisplay(doc.date_sortie) : formatDateForDisplay(doc._id)}</td>
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

  modal.querySelector('.close-btn').addEventListener('click', () => {
    modalManager.closeCurrent();
  });
  
  modal.querySelector('#cancelEditBtn').addEventListener('click', () => {
    modalManager.closeCurrent();
  });

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
      if (input.type === 'datetime-local') {
        doc[key] = input.value ? new Date(input.value).toISOString() : '';
      } else {
        doc[key] = input.type === 'number' ? parseFloat(input.value) : input.value;
      }
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

    await loadGAPI();
    
    const client = google.accounts.oauth2.initTokenClient({
      client_id: '283743756981-c3dp88fodaudspddumurobveupvhll7e.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      callback: async (tokenResponse) => {
        try {
          if (tokenResponse.error) throw new Error(tokenResponse.error);
          
          const csvContent = generateCSVContent();
          const today = new Date();
          const dateStr = formatDateForFilename(today);
          const magasinFilter = document.getElementById('magasinFilter').value;
          let filename = `export_stock_${dateStr}`;
          if (magasinFilter) filename += `_${magasinFilter}`;
          filename += '.csv';

          const boundary = "----boundary_" + Math.random().toString(16).substr(2);
          const nl = "\r\n";
          
          const mimeParts = [
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
            '',
            'Veuillez trouver ci-joint l\'export des stocks.',
            '',
            `--${boundary}`,
            'Content-Type: text/csv; charset=UTF-8',
            `Content-Disposition: attachment; filename="${filename}"`,
            'Content-Transfer-Encoding: base64',
            '',
            chunkSplit(toBase64(csvContent), 76),
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

          const encodedMessage = toBase64(rawMessage)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

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

  let detailsHtml = `
    <div class="modal-content">
      <span class="close-btn">&times;</span>
      <h3>Détails complet</h3>
      <div class="detail-grid">
        <div class="detail-item"><strong>Date:</strong> ${formatDateForDisplay(doc._id)}</div>
        <div class="detail-item"><strong>Code Produit:</strong> ${doc.code_produit || '-'}</div>
        <div class="detail-item"><strong>Désignation:</strong> ${doc.designation || '-'}</div>
        <div class="detail-item"><strong>Quantité consommée:</strong> ${doc.quantité_consommee || '-'}</div>
        <div class="detail-item"><strong>Unités:</strong> ${doc.unites || '-'}</div>
        <div class="detail-item"><strong>À commander:</strong> ${doc.a_commander || '-'}</div>
        <div class="detail-item"><strong>Remarques:</strong> ${doc.remarques || '-'}</div>
        <div class="detail-item"><strong>Magasin:</strong> ${doc.magasin || '-'}</div>
        <div class="detail-item"><strong>Date de sortie:</strong> ${doc.date_sortie ? formatDateForDisplay(doc.date_sortie) : '-'}</div>
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
