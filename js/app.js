// Variables globales
let excelData = [];
let imageFiles = [];
let qrReader = null;
let isSubmitting = false;
let currentAccount = null;
const STOCK_STATE_PREFIX = "stock_state::";
const COUCHDB_BASE_URL = "https://couchdb.monproprecloud.fr";
const COUCHDB_DB_URL = `${COUCHDB_BASE_URL}/stocks`;

// Configuration PouchDB
const localDB = new PouchDB("stocks");
let remoteDB = null;
let syncHandler = null;

function updateSubmitStatus(state, message) {
  const statusBox = document.getElementById("submitStatus");
  if (!statusBox) return;

  statusBox.classList.remove("hidden", "is-pending", "is-syncing", "is-ok", "is-warning", "is-error");
  statusBox.classList.add(state);
  statusBox.textContent = message;
}

function hideSubmitStatus() {
  const statusBox = document.getElementById("submitStatus");
  if (!statusBox) return;

  statusBox.classList.add("hidden");
  statusBox.classList.remove("is-pending", "is-syncing", "is-ok", "is-warning", "is-error");
  statusBox.textContent = "";
}

async function confirmRemoteSync(docId, expectedRev, successMessage) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    updateSubmitStatus("is-warning", "Enregistrement effectue. Synchronisation avec la base distante en attente de connexion.");
    return;
  }

  updateSubmitStatus("is-syncing", "Enregistrement effectue. Verification de la synchronisation avec la base distante en cours...");

  const db = setupRemoteDB();
  const attempts = 8;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const remoteDoc = await db.get(docId);
      if (!expectedRev || remoteDoc._rev === expectedRev) {
        updateSubmitStatus("is-ok", successMessage);
        return;
      }
    } catch (error) {
      if (error.status !== 404) {
        console.warn("Verification de synchronisation distante impossible :", error);
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  updateSubmitStatus("is-warning", "Enregistrement effectue, mais la confirmation de synchronisation distante prend plus de temps que prevu.");
}

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

// Fonction utilitaire pour la date
function formatToDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function updateSortieDate() {
  document.getElementById("date_sortie").value = formatToDateTimeLocal(new Date());
}

function normalizeProductCode(code) {
  return String(code || "").trim().toLowerCase();
}

function parseNonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function getNumberFromRow(row, keys = [], fallback = 0) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      const parsed = Number(row[key]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return fallback;
}

function getStockStateDocId(code) {
  return `${STOCK_STATE_PREFIX}${normalizeProductCode(code)}`;
}

function setStockFields({ stockActuel, stockMin, stockMax }) {
  document.getElementById("stock_actuel").value = String(stockActuel);
  document.getElementById("stock_min").value = String(stockMin);
  document.getElementById("stock_max").value = String(stockMax);
  updateCommanderFieldFromStock();
}

function getStockStatus(stockActuel, stockMin, stockMax, quantiteConsommee) {
  const stockApres = Math.max(0, stockActuel - quantiteConsommee);
  const isMaxReached = stockMax > 0 && stockActuel >= stockMax;
  const safetyZone = stockMax > stockMin ? Math.max(1, Math.round((stockMax - stockMin) * 0.2)) : 1;
  const isNearMin = stockApres > stockMin && stockApres <= stockMin + safetyZone;

  if (stockApres === 0) {
    return {
      alertClass: "is-critical",
      shouldOrder: true,
      message: "Rupture de stock: stock à 0 après déstockage."
    };
  }

  if (isMaxReached) {
    return {
      alertClass: "is-max",
      shouldOrder: false,
      message: "Stock maximum atteint."
    };
  }

  if (stockApres <= stockMin) {
    return {
      alertClass: "is-critical",
      shouldOrder: true,
      message: `Stock bas: seuil minimum atteint (${stockApres} <= ${stockMin}).`
    };
  }

  if (isNearMin) {
    return {
      alertClass: "is-warning",
      shouldOrder: false,
      message: `Vigilance: stock proche du minimum (${stockApres}).`
    };
  }

  return {
    alertClass: "is-ok",
    shouldOrder: false,
    message: `Stock correct: ${stockApres} unité(s) restantes.`
  };
}

function updateStockAlert(status) {
  const alertBox = document.getElementById("stockAlert");
  if (!alertBox) return;

  alertBox.className = `stock-alert ${status.alertClass}`;
  alertBox.textContent = status.message;
}

function updateCommanderFieldFromStock() {
  const stockActuel = parseNonNegativeNumber(document.getElementById("stock_actuel").value);
  const stockMin = parseNonNegativeNumber(document.getElementById("stock_min").value);
  const stockMax = parseNonNegativeNumber(document.getElementById("stock_max").value);
  const quantiteConsommee = parseNonNegativeNumber(document.getElementById("quantité_consommee").value);
  const status = getStockStatus(stockActuel, stockMin, stockMax, quantiteConsommee);
  document.getElementById("a_commander").value = status.shouldOrder ? "Oui" : "Non";
  updateStockAlert(status);
}

async function loadStockStateForCode(code, excelRow = null) {
  const normalizedCode = normalizeProductCode(code);
  if (!normalizedCode) {
    setStockFields({ stockActuel: 0, stockMin: 0, stockMax: 0 });
    return;
  }

  const fallbackMin = excelRow ? getNumberFromRow(excelRow, ["Stock Min", "Stock_Min", "Stock minimum"], 0) : 0;
  const fallbackMax = excelRow ? getNumberFromRow(excelRow, ["Stock Max", "Stock_Max", "Stock maximum"], 0) : 0;
  const fallbackCurrent = excelRow ? getNumberFromRow(excelRow, ["Stock", "Stock Actuel", "Stock_Actuel", "Stock actuel", "Stock initial"], 0) : 0;
  let resolvedStock = {
    stockActuel: fallbackCurrent,
    stockMin: fallbackMin,
    stockMax: fallbackMax
  };

  try {
    const docs = await localDB.allDocs({ include_docs: true });
    const latestRecord = docs.rows
      .map((row) => row.doc)
      .filter((doc) => {
        if (!doc || doc.type === "stock_state" || String(doc._id || "").startsWith("_design")) return false;
        return normalizeProductCode(doc.code_produit || doc.codeproduit) === normalizedCode;
      })
      .sort((a, b) => new Date(b.date_sortie || b._id).getTime() - new Date(a.date_sortie || a._id).getTime())[0];

    if (latestRecord) {
      resolvedStock = {
        stockActuel: parseNonNegativeNumber(latestRecord.stock_actuel, fallbackCurrent),
        stockMin: parseNonNegativeNumber(latestRecord.stock_min, fallbackMin),
        stockMax: parseNonNegativeNumber(latestRecord.stock_max, fallbackMax)
      };
      setStockFields(resolvedStock);
    }
  } catch (error) {
    console.error("Erreur chargement dernier enregistrement stock :", error);
  }

  try {
    const stateDoc = await localDB.get(getStockStateDocId(normalizedCode));
    setStockFields({
      stockActuel: parseNonNegativeNumber(stateDoc.stock_actuel, fallbackCurrent),
      stockMin: parseNonNegativeNumber(stateDoc.stock_min, fallbackMin),
      stockMax: parseNonNegativeNumber(stateDoc.stock_max, fallbackMax)
    });
  } catch (error) {
    if (error.status !== 404) {
      console.error("Erreur chargement stock courant :", error);
    }

    setStockFields(resolvedStock);
  }
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

function updateUIForUserRole() {
  const adminLink = document.getElementById('adminLink');
  
  if (currentAccount) {
    adminLink.style.display = 'block';
    adminLink.textContent = '📊 Voir mes enregistrements';
    // Ajout du paramètre fromIndex
    adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;
  } else {
    adminLink.style.display = 'none';
  }
}

function initializeVoiceInputSupport() {
  if (!window.VoiceInputEnhancer) return;

  window.VoiceInputEnhancer.attach("#designation", {
    lang: "fr-FR",
    ariaLabel: "Dicter la designation"
  });

  window.VoiceInputEnhancer.attach("#unites", {
    lang: "fr-FR",
    ariaLabel: "Dicter l'unite"
  });

  window.VoiceInputEnhancer.attach("#remarques", {
    lang: "fr-FR",
    ariaLabel: "Dicter les remarques"
  });

  window.VoiceInputEnhancer.attach("#axe2", {
    lang: "fr-FR",
    ariaLabel: "Dicter l'axe 2"
  });
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

// Gestion de la session
window.addEventListener("DOMContentLoaded", async () => {
  currentAccount = sessionStorage.getItem('currentAccount');

  if (!(await ensureAuthenticatedSession())) {
    return;
  }

  currentAccount = sessionStorage.getItem("currentAccount");
  setupRemoteDB();
  startSync();

  // Mise à jour de l'interface utilisateur
  updateUIForUserRole(); 
  updateUserInterface();
  initializeVoiceInputSupport();
  hideSubmitStatus();
  
  // Chargement des données Excel
  loadExcelData();

 const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }  
});

function updateUserInterface() {
  const currentAccount = sessionStorage.getItem('currentAccount');
  const currentServiceName = sessionStorage.getItem('currentServiceName') || getAxe1Label(currentAccount);
  
  // Mettre à jour l'affichage du compte
  document.getElementById('currentUserLabel').textContent = currentServiceName;
  
  // Afficher le bouton Retour seulement si nécessaire
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.style.display = currentAccount === 'Admin' ? 'none' : 'block';
  }
}

// Chargement Excel (reste identique)
function loadExcelData() {
  fetch("modele/stocker_temp.xlsx")
    .then((r) => r.arrayBuffer())
    .then((data) => {
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      excelData = XLSX.utils.sheet_to_json(sheet);
      
      const designationList = document.getElementById("designationList");
      designationList.innerHTML = '';
      
      const codeList = document.getElementById("codeProduitList");
      codeList.innerHTML = '';
      
      const designations = new Set();
      const codes = new Set();
      
      excelData.forEach((row) => {
        const designation = row["Désignation:"] || row["Désignation"];
        if (designation) designations.add(String(designation).trim());
        
        const code = row["Code_Produit"];
        if (code) codes.add(String(code).trim());
      });
      
      designations.forEach(designation => {
        const option = document.createElement("option");
        option.value = designation;
        designationList.appendChild(option);
      });
      
      codes.forEach(code => {
        const option = document.createElement("option");
        option.value = code;
        codeList.appendChild(option);
      });
      
      // Gestion du mode de scan (Bluetooth par défaut)
      const mode = document.getElementById("modeScan");
      const qrDiv = document.getElementById("qr-reader");
      
      mode.value = "bluetooth";
      qrDiv.classList.remove("active");
      focusScannerInput();
      
      mode.onchange = () => {
        if (mode.value === "camera") {
          initQRScanner();
        } else {
          stopQRScanner();
          focusScannerInput();
        }
      };
      
      setupEventListeners();
      resetForm();
    })
    .catch((e) => {
      console.error("Erreur chargement Excel :", e);
      alert("Erreur lors du chargement du fichier Excel");
    });
}

// Remplissage du formulaire (reste identique)
async function fillFormFromExcel(match) {
  const map = {
    "Code_Produit": "code_produit",
    "Désignation:": "designation",
    "Désignation": "designation",
    "Quantité_Consommée": "quantité_consommee",
    "unité(s)": "unites",
    "A Commander": "a_commander",
    "Remarques:": "remarques",
    "Magasin": "magasin",
    "axe2": "axe2"
  };

  for (const [excelKey, formId] of Object.entries(map)) {
    if (match[excelKey] !== undefined && document.getElementById(formId)) {
      document.getElementById(formId).value = match[excelKey];
    }
  }

  setStockFields({
    stockActuel: getNumberFromRow(match, ["Stock_Actuel", "Stock Actuel", "Stock actuel", "Stock"], 0),
    stockMin: getNumberFromRow(match, ["Stock_Min", "Stock Min", "Stock minimum"], 0),
    stockMax: getNumberFromRow(match, ["Stock_Max", "Stock Max", "Stock maximum"], 0)
  });

  if (!match["axe2"] || String(match["axe2"]).trim() === "") {
    document.getElementById("axe2").value = "SUP=SEMPQRLER";
  }

  document.getElementById("axe1").value = currentAccount;
  updateSortieDate();

  await loadStockStateForCode(document.getElementById("code_produit").value, match);
}

// Écouteurs d'événements (reste identique)
function setupEventListeners() {
  ["stock_actuel", "stock_min", "stock_max", "quantité_consommee"].forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener("input", updateCommanderFieldFromStock);
  });

  document.getElementById("code_produit").addEventListener("input", function() {
    const codeValue = normalizeProductCode(this.value);
    if (codeValue) {
      const match = excelData.find(
        (row) => normalizeProductCode(row["Code_Produit"]) === codeValue
      );
      if (match) {
        fillFormFromExcel(match);
      } else {
        updateSortieDate();
        loadStockStateForCode(codeValue);
      }
    } else {
      updateSortieDate();
      loadStockStateForCode("");
    }
  });

  document.getElementById("designation").addEventListener("input", function() {
    const val = String(this.value).trim().toLowerCase();
    const match = excelData.find(
      (row) => (row["Désignation:"] || row["Désignation"] || "").toLowerCase() === val
    );
    if (match) {
      fillFormFromExcel(match);
    } else {
      updateSortieDate();
    }
  });
}

// Scanner QR (reste identique)
function initQRScanner() {
  const qrDiv = document.getElementById("qr-reader");
  qrDiv.classList.add("active");
  if (Html5Qrcode.getCameras().then) {
    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices && devices.length) {
          qrReader = new Html5Qrcode("qr-reader");
          qrReader.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (text) => {
              if (!isSubmitting) {
                const codeInput = document.getElementById("code_produit");
                codeInput.value = text;
                // Déclencher l'événement input pour remplir les autres champs
                codeInput.dispatchEvent(new Event("input", { bubbles: true }));
              }
            },
            (err) => console.warn("QR error", err)
          ).catch((err) => console.error("QR init error", err));
        }
      })
      .catch(err => console.error("Camera access error:", err));
  }
}

function focusScannerInput() {
  document.getElementById("code_produit").focus();
}

function restoreSelectedScanMode() {
  const mode = document.getElementById("modeScan");
  if (mode && mode.value === "camera") {
    initQRScanner();
    return;
  }

  stopQRScanner();
  focusScannerInput();
}

function stopQRScanner() {
  if (qrReader) {
    qrReader.stop().catch(err => console.error("Failed to stop QR scanner", err));
  }
  const qrDiv = document.getElementById("qr-reader");
  qrDiv.classList.remove("active");
}

// Gestion des photos (reste identique)
function compresserImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = (img.height / img.width) * 800;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(callback, "image/jpeg", 0.7);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updatePhotoCount() {
  document.getElementById("photoCount").textContent = imageFiles.length;
}

function handleFiles(fileList) {
  const files = Array.from(fileList);
  if (imageFiles.length + files.length > 3) {
    alert("Maximum 3 photos !");
    return;
  }

  files.forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    compresserImage(file, (blob) => {
      imageFiles.push(blob);
      const reader = new FileReader();
      reader.onload = (e) => {
        const wrapper = document.createElement("div");
        wrapper.className = "preview-image";

        const img = document.createElement("img");
        img.src = e.target.result;

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-button";
        removeBtn.textContent = "x";

        removeBtn.addEventListener("click", () => {
          const idx = Array.from(document.getElementById("previewContainer").children).indexOf(wrapper);
          if (idx !== -1) {
            imageFiles.splice(idx, 1);
            wrapper.remove();
            updatePhotoCount();
          }
        });

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        document.getElementById("previewContainer").appendChild(wrapper);
        updatePhotoCount();
      };
      reader.readAsDataURL(blob);
    });
  });
}

// Écouteurs pour les photos (reste identique)
document.getElementById("cameraInput").addEventListener("change", (e) => handleFiles(e.target.files));
document.getElementById("galleryInput").addEventListener("change", (e) => handleFiles(e.target.files));
document.getElementById("takePhotoBtn").addEventListener("click", () => document.getElementById("cameraInput").click());
document.getElementById("chooseGalleryBtn").addEventListener("click", () => document.getElementById("galleryInput").click());

// Soumission du formulaire
document.getElementById("stockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  if (!currentAccount || sessionStorage.getItem("authenticated") !== "true") {
    alert("Veuillez vous authentifier avant de soumettre le formulaire");
    window.location.href = 'login.html';
    return;
  }
  
  if (isSubmitting) return;
  isSubmitting = true;

  stopQRScanner();

  const form = new FormData(e.target);
  const codeProduit = String(form.get("code_produit") || "").trim();
  const normalizedCodeProduit = normalizeProductCode(codeProduit);
  const quantiteConsommee = parseNonNegativeNumber(form.get("quantité_consommee"));
  const stockActuel = parseNonNegativeNumber(form.get("stock_actuel"));
  const stockMin = parseNonNegativeNumber(form.get("stock_min"));
  const stockMax = parseNonNegativeNumber(form.get("stock_max"));

  if (!normalizedCodeProduit) {
    alert("Veuillez renseigner un code produit.");
    isSubmitting = false;
    restoreSelectedScanMode();
    return;
  }

  if (!quantiteConsommee || quantiteConsommee <= 0) {
    alert("La quantité déstockée doit être supérieure à 0.");
    isSubmitting = false;
    restoreSelectedScanMode();
    return;
  }

  if (stockMin > stockMax) {
    alert("Le stock minimum ne peut pas être supérieur au stock maximum.");
    isSubmitting = false;
    restoreSelectedScanMode();
    return;
  }

  if (quantiteConsommee > stockActuel) {
    alert("Déstockage impossible : la quantité dépasse le stock actuel.");
    isSubmitting = false;
    restoreSelectedScanMode();
    return;
  }

  const stockApres = stockActuel - quantiteConsommee;
  const status = getStockStatus(stockActuel, stockMin, stockMax, quantiteConsommee);
  const record = { 
    _id: new Date().toISOString(), 
    photos: [],
    axe1: currentAccount
  };

  form.forEach((val, key) => {
    if (key === "date_sortie") {
      record[key] = new Date(val).toISOString();
    } else {
      record[key] = val;
    }
  });

  record.code_produit = codeProduit;
  record.quantité_consommee = quantiteConsommee;
  record.stock_avant = stockActuel;
  record.stock_apres = stockApres;
  record.stock_actuel = stockApres;
  record.stock_min = stockMin;
  record.stock_max = stockMax;
  if (status.shouldOrder) {
    record.a_commander = "Oui";
  } else if (!record.a_commander) {
    record.a_commander = "Non";
  }

  if (imageFiles.length > 0) {
    for (const file of imageFiles) {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      record.photos.push(base64);
    }
  }

  try {
    const saveResult = await localDB.put(record);
    await upsertStockState(codeProduit, stockApres, stockMin, stockMax);
    alert("Stock enregistre !");
    updateSubmitStatus("is-pending", "Stock enregistre. Synchronisation avec la base distante en cours...");
    await confirmRemoteSync(record._id, saveResult.rev, "Stock enregistre et synchronise avec la base distante.");
    resetForm();
  } catch (err) {
    console.error("Erreur sauvegarde :", err);
    updateSubmitStatus("is-error", "Erreur lors de l'enregistrement du stock.");
  } finally {
    isSubmitting = false;
    restoreSelectedScanMode();
  }
});

// Réinitialisation
function resetForm() {
  document.getElementById("stockForm").reset();
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  document.getElementById("code_produit").value = "";
  document.getElementById("designation").value = "";
  document.getElementById("axe1").value = currentAccount;
  document.getElementById("axe2").value = "SUP=SEMPQRLER";
  setStockFields({ stockActuel: 0, stockMin: 0, stockMax: 0 });
  updateSortieDate();
}

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Voulez-vous vraiment réinitialiser le formulaire ?")) {
    hideSubmitStatus();
    resetForm();
  }
});


