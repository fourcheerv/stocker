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
  if (currentAccount) {
    document.getElementById('currentUserLabel').textContent = getAxe1Label(currentAccount);
  }

  loadData();
}

// [Les fonctions checkAuth(), setupEventListeners(), handleTableClick()... restent identiques]

function filterData() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filterValue = document.getElementById('filterSelect').value;
  const dateFilterValue = document.getElementById('dateFilter').value;
  const commandeFilter = document.getElementById('commandeFilter').value;
  const magasinFilter = document.getElementById('magasinFilter').value;

  filteredDocs = allDocs.filter(doc => {
    // Filtre par compte
    if (filterValue && doc.axe1 !== filterValue) return false;
    
    // Filtre par date de sortie (corrigé)
    if (dateFilterValue) {
      const docDate = doc.date_sortie ? new Date(doc.date_sortie) : new Date(doc._id);
      const filterDate = new Date(dateFilterValue);
      
      return (
        docDate.getFullYear() === filterDate.getFullYear() &&
        docDate.getMonth() === filterDate.getMonth() && 
        docDate.getDate() === filterDate.getDate()
      );
    }
    
    // [Les autres filtres restent identiques]
    return true;
  });

  updateStats();
  renderTable();
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

  // [Gestion des événements reste identique]
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
    const dateValue = value ? new Date(value).toISOString().split('T')[0] : '';
    return `<input type="date" id="edit_${key}" class="form-control" value="${dateValue}">`;
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
      // Conversion spécifique pour les dates
      if (input.type === 'date') {
        doc[key] = input.value ? new Date(input.value).toISOString() : '';
      } else {
        doc[key] = input.type === 'number' ? parseFloat(input.value) : input.value;
      }
    });
    
    await localDB.put(doc);
    loadData(); // Recharge les données avec les nouveaux filtres
  } catch (error) {
    console.error("Erreur lors de la mise à jour:", error);
    alert("Erreur lors de la mise à jour");
  }
}

// [Les autres fonctions restent identiques]
