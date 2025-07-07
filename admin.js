// Configuration de la base de données
const localDB = new PouchDB('stocks');
const remoteDB = new PouchDB('https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks');

// Variables globales
let currentPage = 1;
const rowsPerPage = 20;
let allSortedRows = [];
let sortOrder = 'desc';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initDB().then(loadData);
    
    // Événements
    document.getElementById('searchBtn').addEventListener('click', searchData);
    document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
    document.getElementById('exportZipBtn').addEventListener('click', exportToZip);
    document.getElementById('selectAll').addEventListener('change', toggleSelectAll);
    document.getElementById('sortDate').addEventListener('click', toggleSortOrder);
    document.getElementById('closePopup').addEventListener('click', closeImagePopup);
});

// Initialisation de la base de données
async function initDB() {
    try {
        // Encoder le mot de passe pour l'URL
        const encodedPassword = encodeURIComponent('M,jvcmHSdl54!');
        const remoteDB = new PouchDB(`https://admin:${encodedPassword}@couchdb.monproprecloud.fr/stocks`);
        
        // Vérifier la connexion
        const remoteInfo = await remoteDB.info().catch(() => null);
        
        if (!remoteInfo) {
            console.warn("Impossible de se connecter à CouchDB, utilisation en mode local uniquement");
            return { localDB, remoteDB: null };
        }

        // Configurer la synchronisation
        const sync = localDB.sync(remoteDB, {
            live: true,
            retry: true,
            heartbeat: 10000,
            timeout: 5000
        });

        sync.on('change', function(change) {
            console.log('Changement synchronisé:', change);
        }).on('error', function(err) {
            console.error('Erreur de synchronisation:', err);
        });

        return sync;
    } catch (error) {
        console.error('Erreur initialisation DB:', error);
        throw error;
    }
}

// Chargement des données
async function loadData() {
    console.log("Tentative de chargement des données...");
    try {
        // Option 1: Essayer d'abord la base locale
        let result = await localDB.allDocs({ include_docs: true });
        console.log("Résultat local:", result);

        // Si la base locale est vide, essayer directement CouchDB
        if (!result.rows || result.rows.length === 0) {
            console.warn("Base locale vide, tentative directe avec CouchDB...");
            try {
                result = await remoteDB.allDocs({ include_docs: true });
                console.log("Résultat direct CouchDB:", result);
                
                if (!result.rows || result.rows.length === 0) {
                    console.warn("La base CouchDB est également vide");
                    alert("Aucune donnée trouvée dans la base de données");
                    return;
                }
            } catch (remoteError) {
                console.error("Erreur d'accès direct à CouchDB:", remoteError);
                alert("Erreur de connexion à la base de données. Voir la console (F12)");
                return;
            }
        }

        // Tri des données
        allSortedRows = result.rows.sort((a, b) => {
            const dateA = new Date(a.doc._id);
            const dateB = new Date(b.doc._id);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        console.log("Données triées:", allSortedRows);
        updateTable();
        updatePaginationControls();
        updateSortIndicator();

    } catch (error) {
        console.error("Erreur complète:", error);
        alert("Erreur technique - Voir la console (F12)");
    }
}

// Mise à jour du tableau
function updateTable() {
    const tbody = document.querySelector('#dataTable tbody');
    tbody.innerHTML = '';
    
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageRows = allSortedRows.slice(start, end);
    
    pageRows.forEach(row => {
        const { _id, code_produit, designation, quantité_consommee, unites, a_commander, magasin, photos, axe1 } = row.doc;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="selectRow" data-id="${_id}"></td>
            <td>${_id.substring(0, 8)}...</td>
            <td>${code_produit || "N/A"}</td>
            <td>${designation || "N/A"}</td>
            <td>${quantité_consommee || 0}</td>
            <td>${unites || "N/A"}</td>
            <td>${new Date(_id).toLocaleString()}</td>
            <td>${a_commander || "N/A"}</td>
            <td>${magasin || "N/A"}</td>
            <td>
                ${(photos || []).map((photo, i) => 
                    `<img src="${photo}" alt="Photo ${i + 1}" class="table-img" onclick="showImage('${photo}')">`
                ).join('') || "Aucune"}
            </td>
            <td>${axe1 === "SCT=E382329" ? "Rotatives" : "Expédition"}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Pagination
function updatePaginationControls() {
    const totalPages = Math.ceil(allSortedRows.length / rowsPerPage);
    const container = document.getElementById('paginationControls');
    container.innerHTML = '';
    
    // Bouton Précédent
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateTable();
        }
    });
    container.appendChild(prevBtn);
    
    // Info de page
    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Page ${currentPage} / ${Math.max(1, totalPages)}`;
    container.appendChild(pageInfo);
    
    // Bouton Suivant
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '▶';
    nextBtn.disabled = currentPage >= Math.max(1, totalPages);
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateTable();
        }
    });
    container.appendChild(nextBtn);
}

// Recherche
function searchData() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const rows = document.querySelectorAll('#dataTable tbody tr');
    
    rows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        row.style.display = rowText.includes(query) ? '' : 'none';
    });
}

// Suppression multiple
async function deleteSelected() {
    const checkboxes = document.querySelectorAll('.selectRow:checked');
    if (checkboxes.length === 0) {
        alert('Aucun élément sélectionné');
        return;
    }
    
    if (!confirm(`Supprimer ${checkboxes.length} élément(s) ?`)) return;
    
    try {
        for (const checkbox of checkboxes) {
            const doc = await localDB.get(checkbox.dataset.id);
            await localDB.remove(doc);
        }
        alert('Suppression réussie');
        loadData();
    } catch (error) {
        console.error('Erreur de suppression:', error);
        alert('Erreur lors de la suppression');
    }
}

// Export Excel
async function exportToExcel() {
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
        XLSX.writeFile(workbook, 'Export_Stocks.xlsx');
        
    } catch (error) {
        console.error('Erreur export Excel:', error);
        alert('Erreur lors de l\'export Excel');
    }
}

// Export ZIP
async function exportToZip() {
    if (!confirm('Générer un export ZIP de toutes les données ?')) return;
    
    try {
        const zip = new JSZip();
        const data = allSortedRows.map(row => row.doc);
        
        for (const item of data) {
            const folder = zip.folder(`Stock_${item._id.substring(0, 8)}`);
            
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
                date: new Date(item._id).toISOString()
            };
            folder.file('info.json', JSON.stringify(jsonData, null, 2));
            
            // Photos
            if (item.photos && item.photos.length > 0) {
                const photosFolder = folder.folder('photos');
                for (let i = 0; i < item.photos.length; i++) {
                    const response = await fetch(item.photos[i]);
                    const blob = await response.blob();
                    photosFolder.file(`photo_${i+1}.jpg`, blob);
                }
            }
        }
        
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'Stocks_Export.zip');
        
    } catch (error) {
        console.error('Erreur export ZIP:', error);
        alert('Erreur lors de l\'export ZIP');
    }
}

// Gestion des images
function showImage(src) {
    document.getElementById('popupImage').src = src;
    document.getElementById('imagePopup').style.display = 'flex';
}

function closeImagePopup() {
    document.getElementById('imagePopup').style.display = 'none';
}

// Helpers
function toggleSelectAll(e) {
    document.querySelectorAll('.selectRow').forEach(checkbox => {
        checkbox.checked = e.target.checked;
    });
}

function toggleSortOrder() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    loadData();
}

function updateSortIndicator() {
    const sortElement = document.getElementById('sortDate');
    sortElement.innerHTML = `Date d'enregistrement ${sortOrder === 'asc' ? '&#8593;' : '&#8595;'}`;
}

// Exposer showImage au scope global
window.showImage = showImage;