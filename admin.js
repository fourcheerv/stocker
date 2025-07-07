console.log("Script admin.js chargé");

// Configuration sécurisée - À remplacer par une méthode plus sécurisée en production
const getDbConfig = () => {
  // En production, utiliser plutôt des variables d'environnement
  // ou une requête sécurisée pour obtenir les credentials
  return {
    username: 'admin',
    password: encodeURIComponent('M,jvcmHSdl54!'),
    url: 'couchdb.monproprecloud.fr'
  };
};

// Configuration de la base de données
let localDB;
let remoteDB;
let syncHandler;

// Variables globales
let currentPage = 1;
const rowsPerPage = 20;
let allSortedRows = [];
let sortOrder = 'desc';
let isLoading = false;

// Initialisation
let isAppReady = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("Initialisation en cours...");
    await initializeApplication();
    isAppReady = true;
    console.log("Application prête");
    enableAllButtons(true);
  } catch (error) {
    console.error("Erreur d'initialisation:", error);
    showError("L'application n'a pas pu démarrer");
  }
});

function enableAllButtons(enable) {
  const buttons = [
    'searchBtn', 
    'deleteSelectedBtn',
    'exportBtn',
    'exportZipBtn',
    'exportCsvBtn',
    'sortDate',
    'selectAll'
  ];
  
  buttons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = !enable;
      btn.style.opacity = enable ? 1 : 0.5;
    }
  });
}

async function initializeApplication() {
  showLoading(true);
  
  try {
    await setupDatabases();
    await resetLocalDB(true); // Réinitialisation silencieuse
    await initDB();
    await loadData();
    
    setupEventListeners();
    showLoading(false);
  } catch (error) {
    showLoading(false);
    throw error;
  }
}

function setupDatabases() {
  const { username, password, url } = getDbConfig();
  
  // Détruire l'ancienne base locale si elle existe
  if (localDB) {
    localDB.close();
  }
  
  localDB = new PouchDB('stocks');
  remoteDB = new PouchDB(`https://${username}:${password}@${url}/stocks`, {
    fetch: (url, opts) => {
      opts.credentials = 'omit'; // Sécurité supplémentaire
      return PouchDB.fetch(url, opts);
    }
  });
}

function setupEventListeners() {
  // Vérification explicite de chaque élément
  const elements = {
    'searchBtn': () => searchData(),
    'deleteSelectedBtn': () => confirmDelete(),
    'exportBtn': () => exportToExcel(),
    'exportZipBtn': () => exportToZip(),
    'exportCsvBtn': () => exportToCsvSimple(),
    'selectAll': (e) => toggleSelectAll(e),
    'sortDate': () => toggleSortOrder(),
    'closePopup': () => closeImagePopup()
  };

  Object.entries(elements).forEach(([id, handler]) => {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`Élément ${id} non trouvé`);
      return;
    }

    console.log(`Attache événement à ${id}`);
    element.addEventListener('click', handler);
    element.style.border = '1px solid green'; // Debug visuel
  });
}

async function refreshData() {
  try {
    showLoading(true);
    await loadData();
  } catch (error) {
    console.error("Erreur de rafraîchissement:", error);
    showError("Erreur lors du rafraîchissement des données");
  } finally {
    showLoading(false);
  }
}

// Réinitialisation de la base locale
async function resetLocalDB(silent = false) {
  if (silent || confirm("Voulez-vous vraiment réinitialiser le cache local ?")) {
    try {
      await localDB.destroy();
      localDB = new PouchDB('stocks');
      
      if (!silent) {
        showNotification("Cache local réinitialisé. Rechargement...");
        setTimeout(() => location.reload(), 1000);
      }
    } catch (err) {
      console.warn("Erreur resetLocalDB:", err);
      if (!silent) {
        showError("Erreur lors de la réinitialisation du cache");
      }
    }
  }
}

// Initialisation de la base de données
async function initDB() {
  try {
    // Vérifier la connexion à CouchDB
    const remoteInfo = await remoteDB.info().catch(err => {
      console.error("Erreur de connexion à CouchDB:", err);
      return null;
    });
    
    if (!remoteInfo) {
      console.warn("Mode dégradé : base locale uniquement");
      showNotification("Mode dégradé : connexion au serveur distante échouée", "warning");
      return;
    }

    // Configurer la synchronisation
    syncHandler = localDB.sync(remoteDB, {
      live: true,
      retry: true,
      heartbeat: 10000,
      timeout: 5000
    });

    syncHandler
      .on('change', change => {
        console.log('Changement synchronisé:', change);
        loadData();
      })
      .on('error', err => {
        console.error('Erreur de synchronisation:', err);
        showError("Erreur de synchronisation avec le serveur");
      });

    return syncHandler;
  } catch (error) {
    console.error('Erreur initDB:', error);
    throw error;
  }
}

// Chargement des données optimisé
async function loadData() {
  if (isLoading) return;
  isLoading = true;
  
  try {
    showLoading(true, "Chargement des données...");
    
    // Essayer d'abord la base locale
    let result = await localDB.allDocs({ include_docs: true });
    console.log("Documents locaux:", result.rows.length);

    // Si vide, essayer directement CouchDB
    if (result.rows.length === 0) {
      console.log("Base locale vide, tentative avec CouchDB...");
      result = await remoteDB.allDocs({ include_docs: true });
      console.log("Documents distants:", result.rows.length);
    }

    // Traitement des résultats
    if (result.rows.length === 0) {
      showNotification("Aucune donnée disponible", "info");
      displayNoDataMessage();
      return;
    }

    // Tri des données
    allSortedRows = result.rows.sort((a, b) => {
      const dateA = new Date(a.doc._id);
      const dateB = new Date(b.doc._id);
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    updateTable();
    updatePaginationControls();
    updateSortIndicator();

  } catch (error) {
    console.error("Erreur loadData:", error);
    showError("Erreur lors du chargement des données");
    displayNoDataMessage(true);
  } finally {
    isLoading = false;
    showLoading(false);
  }
}

function displayNoDataMessage(isError = false) {
  const tbody = document.querySelector('#dataTable tbody');
  tbody.innerHTML = `
    <tr>
      <td colspan="12" style="text-align:center;${isError ? 'color:red;' : ''}">
        ${isError ? 'Erreur de chargement - Voir la console' : 'Aucune donnée disponible'}
      </td>
    </tr>
  `;
}

// Mise à jour du tableau
function updateTable() {
  const tbody = document.querySelector('#dataTable tbody');
  tbody.innerHTML = '';
  
  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pageRows = allSortedRows.slice(start, end);
  
  pageRows.forEach(row => {
    const { _id, code_produit, designation, quantité_consommee, unites, a_commander, magasin, photos, axe1, axe2 } = row.doc;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="selectRow" data-id="${_id}"></td>
      <td>${_id.substring(0, 8)}...</td>
      <td>${escapeHtml(code_produit) || "N/A"}</td>
      <td>${escapeHtml(designation) || "N/A"}</td>
      <td>${quantité_consommee || 0}</td>
      <td>${escapeHtml(unites) || "N/A"}</td>
      <td>${new Date(_id).toLocaleString()}</td>
      <td>${escapeHtml(a_commander) || "N/A"}</td>
      <td>${escapeHtml(magasin) || "N/A"}</td>
      <td>
        ${(photos || []).map((photo, i) => 
          `<img src="${validateImageUrl(photo)}" alt="Photo ${i + 1}" class="table-img" onclick="showImage('${validateImageUrl(photo)}')">`
        ).join('') || "Aucune"}
      </td>
      <td>${escapeHtml(axe1) || "N/A"}</td>
      <td>${escapeHtml(axe2) || "N/A"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Pagination améliorée
function updatePaginationControls() {
  const totalPages = Math.ceil(allSortedRows.length / rowsPerPage);
  const container = document.getElementById('paginationControls');
  container.innerHTML = '';
  
  if (totalPages <= 1) return;

  // Bouton Précédent
  const prevBtn = createPaginationButton('◀', currentPage === 1, () => {
    if (currentPage > 1) {
      currentPage--;
      updateTable();
    }
  });
  container.appendChild(prevBtn);
  
  // Affichage des pages
  const pageDisplay = document.createElement('span');
  pageDisplay.className = 'page-info';
  pageDisplay.textContent = `Page ${currentPage} / ${totalPages}`;
  container.appendChild(pageDisplay);
  
  // Bouton Suivant
  const nextBtn = createPaginationButton('▶', currentPage >= totalPages, () => {
    if (currentPage < totalPages) {
      currentPage++;
      updateTable();
    }
  });
  container.appendChild(nextBtn);
}

function createPaginationButton(text, disabled, onClick) {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

// Recherche améliorée
function searchData() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  
  if (!query) {
    // Si la recherche est vide, réafficher toutes les données paginées
    updateTable();
    return;
  }

  // Filtrer sur toutes les données (pas seulement la page courante)
  const filteredRows = allSortedRows.filter(row => {
    return Object.values(row.doc).some(val => 
      String(val).toLowerCase().includes(query)
    );
  });

  // Afficher les résultats filtrés
  displaySearchResults(filteredRows);
}

function displaySearchResults(results) {
  const tbody = document.querySelector('#dataTable tbody');
  tbody.innerHTML = '';
  
  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Aucun résultat trouvé</td></tr>';
    return;
  }

  results.slice(0, rowsPerPage).forEach(row => {
    const { _id, code_produit, designation, quantité_consommee, unites, a_commander, magasin, photos, axe1, axe2 } = row.doc;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="selectRow" data-id="${_id}"></td>
      <td>${_id.substring(0, 8)}...</td>
      <td>${escapeHtml(code_produit) || "N/A"}</td>
      <td>${escapeHtml(designation) || "N/A"}</td>
      <td>${quantité_consommee || 0}</td>
      <td>${escapeHtml(unites) || "N/A"}</td>
      <td>${new Date(_id).toLocaleString()}</td>
      <td>${escapeHtml(a_commander) || "N/A"}</td>
      <td>${escapeHtml(magasin) || "N/A"}</td>
      <td>
        ${(photos || []).map((photo, i) => 
          `<img src="${validateImageUrl(photo)}" alt="Photo ${i + 1}" class="table-img" onclick="showImage('${validateImageUrl(photo)}')">`
        ).join('') || "Aucune"}
      </td>
      <td>${escapeHtml(axe1) || "N/A"}</td>
      <td>${escapeHtml(axe2) || "N/A"}</td>
    `;
    tbody.appendChild(tr);
  });

  // Mettre à jour les contrôles de pagination pour la recherche
  updateSearchPaginationControls(results.length);
}

function updateSearchPaginationControls(totalResults) {
  const container = document.getElementById('paginationControls');
  container.innerHTML = '';
  
  const resultsInfo = document.createElement('span');
  resultsInfo.className = 'search-info';
  resultsInfo.textContent = `${totalResults} résultat(s) trouvé(s)`;
  container.appendChild(resultsInfo);
}

// Suppression multiple sécurisée
async function deleteSelected() {
  const checkboxes = document.querySelectorAll('.selectRow:checked');
  if (checkboxes.length === 0) {
    showNotification('Aucun élément sélectionné', 'info');
    return;
  }
  
  if (!confirm(`Supprimer ${checkboxes.length} élément(s) ? Cette action est irréversible.`)) return;
  
  showLoading(true, `Suppression de ${checkboxes.length} éléments...`);
  
  try {
    const docsToDelete = await Promise.all(
      Array.from(checkboxes).map(checkbox => localDB.get(checkbox.dataset.id))
    );
    
    const deleteResults = await localDB.bulkDocs(
      docsToDelete.map(doc => ({ ...doc, _deleted: true }))
    );
    
    const successCount = deleteResults.filter(r => r.ok).length;
    showNotification(`${successCount}/${checkboxes.length} éléments supprimés`, 'success');
    
    await loadData();
  } catch (error) {
    console.error('Erreur deleteSelected:', error);
    showError('Erreur lors de la suppression');
  } finally {
    showLoading(false);
  }
}

// Export Excel avec vérification de la librairie
async function exportToExcel() {
  if (!window.XLSX) {
    showError("La bibliothèque d'export Excel n'est pas disponible");
    return;
  }

  showLoading(true, "Préparation de l'export Excel...");
  
  try {
    const data = allSortedRows.map(row => ({
      ID: row.doc._id,
      'Code Produit': row.doc.code_produit || 'N/A',
      'Désignation': row.doc.designation || 'N/A',
      'Quantité Consommée': row.doc.quantité_consommee || 0,
      'Unité(s)': row.doc.unites || 'N/A',
      'À Commander': row.doc.a_commander || 'N/A',
      'Magasin': row.doc.magasin || 'N/A',
      'Date': new Date(row.doc._id).toLocaleString(),
      'Compte': row.doc.axe1 === "SCT=E382329" ? "Rotatives" : "Expédition"
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stocks');
    
    // Ajouter une mise en forme automatique des colonnes
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 30 }, 
      { wch: 10 }, { wch: 10 }, { wch: 15 },
      { wch: 15 }, { wch: 20 }
    ];
    
    XLSX.writeFile(workbook, `Export_Stocks_${new Date().toISOString().slice(0,10)}.xlsx`);
    showNotification('Export Excel généré avec succès', 'success');
  } catch (error) {
    console.error('Erreur exportToExcel:', error);
    showError('Erreur lors de la génération du fichier Excel');
  } finally {
    showLoading(false);
  }
}

// Export ZIP amélioré avec gestion de progression
async function exportToZip() {
  if (!window.JSZip || !window.saveAs) {
    showError("Les bibliothèques nécessaires à l'export ZIP ne sont pas disponibles");
    return;
  }

  if (!confirm('Générer un export ZIP de toutes les données ? Cela peut prendre du temps.')) return;
  
  showLoading(true, "Préparation de l'export ZIP...");
  
  try {
    const zip = new JSZip();
    const data = allSortedRows.map(row => row.doc);
    const totalItems = data.length;
    let processedItems = 0;
    
    // Créer un dossier principal
    const mainFolder = zip.folder(`Stocks_Export_${new Date().toISOString().slice(0,10)}`);
    
    // Traitement par lots pour éviter de bloquer l'UI
    const batchSize = 5;
    for (let i = 0; i < totalItems; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (item) => {
        try {
          const folder = mainFolder.folder(`Stock_${item._id.substring(0, 8)}`);
          
          // Fichier JSON avec les métadonnées
          const jsonData = {
            id: item._id,
            code_produit: item.code_produit,
            designation: item.designation,
            quantité_consommee: item.quantité_consommee,
            unites: item.unites,
            a_commander: item.a_commander,
            magasin: item.magasin,
            axe1: item.axe1,
            axe2: item.axe2,
            date: new Date(item._id).toISOString()
          };
          folder.file('info.json', JSON.stringify(jsonData, null, 2));
          
          // Photos (si disponibles)
          if (item.photos?.length > 0) {
            const photosFolder = folder.folder('photos');
            
            for (let j = 0; j < item.photos.length; j++) {
              const photoUrl = validateImageUrl(item.photos[j]);
              if (!photoUrl) continue;
              
              try {
                const response = await fetch(photoUrl);
                if (response.ok) {
                  const blob = await response.blob();
                  photosFolder.file(`photo_${j+1}.jpg`, blob);
                }
              } catch (error) {
                console.warn(`Erreur chargement photo ${j+1} pour ${item._id}`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`Erreur traitement item ${item._id}`, error);
        } finally {
          processedItems++;
          updateProgress(processedItems, totalItems);
        }
      }));
    }
    
    // Génération du ZIP final
    showLoading(true, "Génération du fichier ZIP...");
    const content = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, metadata => {
      updateProgress(metadata.percent, 100, "Compression...");
    });
    
    saveAs(content, `Stocks_Export_${new Date().toISOString().slice(0,10)}.zip`);
    showNotification('Export ZIP généré avec succès', 'success');
  } catch (error) {
    console.error('Erreur exportToZip:', error);
    showError('Erreur lors de la génération du fichier ZIP');
  } finally {
    showLoading(false);
  }
}

function updateProgress(current, total, message = "Traitement...") {
  const percent = Math.round((current / total) * 100);
  showLoading(true, `${message} ${percent}% (${current}/${total})`);
}

// Export CSV simple sécurisé
function exportToCsvSimple() {
  try {
    const selectedFields = allSortedRows.map(row => {
      return {
        code_produit: escapeCsvValue(row.doc.code_produit || ''),
        a_commander: escapeCsvValue(row.doc.a_commander || ''),
        axe1: escapeCsvValue(row.doc.axe1 || ''),
        axe2: escapeCsvValue(row.doc.axe2 || '')
      };
    });

    const csvContent = [
      'code_produit;a_commander;axe1;axe2',
      ...selectedFields.map(row =>
        `${row.code_produit};${row.a_commander};${row.axe1};${row.axe2}`
      )
    ].join('\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Export_Stocks_Simple_${new Date().toISOString().slice(0,10)}.csv`);
    showNotification('Export CSV généré avec succès', 'success');
  } catch (error) {
    console.error('Erreur exportToCsvSimple:', error);
    showError('Erreur lors de la génération du fichier CSV');
  }
}

// Gestion des images
function showImage(src) {
  const popup = document.getElementById('imagePopup');
  const img = document.getElementById('popupImage');
  
  if (!popup || !img) return;
  
  img.src = validateImageUrl(src) || '';
  popup.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Empêcher le défilement
}

function closeImagePopup() {
  const popup = document.getElementById('imagePopup');
  if (popup) {
    popup.style.display = 'none';
    document.body.style.overflow = ''; // Rétablir le défilement
  }
}

// Helpers
function toggleSelectAll(e) {
  document.querySelectorAll('.selectRow').forEach(checkbox => {
    checkbox.checked = e.target.checked;
  });
}

async function toggleSortOrder() {
  sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  currentPage = 1; // Retour à la première page
  await loadData();
}

function updateSortIndicator() {
  const sortElement = document.getElementById('sortDate');
  if (sortElement) {
    sortElement.innerHTML = `Date d'enregistrement ${sortOrder === 'asc' ? '&#8593;' : '&#8595;'}`;
  }
}

// Fonctions utilitaires
function validateImageUrl(url) {
  if (!url) return null;
  
  try {
    // Vérifier que l'URL est sécurisée (https ou données locales)
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'http:' && !parsed.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
      console.warn("URL non sécurisée bloquée:", url);
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeCsvValue(value) {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Gestion de l'UI
function showLoading(show, message = "Chargement...") {
  const loader = document.getElementById('loadingOverlay');
  const loaderText = document.getElementById('loadingText');
  
  if (loader) loader.style.display = show ? 'flex' : 'none';
  if (loaderText) loaderText.textContent = message;
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

function showError(message) {
  showNotification(message, 'error');
}

// Exposer les fonctions nécessaires au scope global
window.showImage = showImage;
window.closeImagePopup = closeImagePopup;