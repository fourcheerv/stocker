// Variables globales
let excelData = [];
let imageFiles = [];
let qrReader = null;
let isSubmitting = false;
let currentAccount = null;

// Configuration PouchDB
const localDB = new PouchDB("stocks");
let remoteDB = null;

// Initialisation de la connexion distante avec session
function setupRemoteDB() {
  remoteDB = new PouchDB("https://couchdb.monproprecloud.fr/stocks", {
    fetch: (url, opts) => {
      opts.credentials = "include";
      // IMPORTANT : Ne pas envoyer d'Authorization header
      if (opts.headers) {
        delete opts.headers.Authorization;
      }
      return PouchDB.fetch(url, opts);
    },
    skip_setup: true
  });

  localDB.sync(remoteDB, { live: true, retry: true })
    .on("change", (info) => {
      console.log("Sync change:", info);
    })
    .on("paused", () => {
      console.log("Sync paused");
    })
    .on("active", () => {
      console.log("Sync active");
    })
    .on('error', function (err) {
      console.error("Erreur de synchronisation :", err);
      if (err.status === 401 && err.name === "unauthorized") {
        alert("Session expirée, veuillez vous reconnecter");
        // logout(); // <--- Mets cette ligne en commentaire pour debug
        console.log("⚠️ Débogage : la fonction logout() serait appelée ici !");
      }
    });
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
  const dateSortie = document.getElementById("date_sortie");
  if (dateSortie) {
    dateSortie.value = formatToDateTimeLocal(new Date());
  }
}

function updateUIForUserRole() {
  const adminLink = document.getElementById('adminLink');
  if (adminLink && currentAccount) {
    adminLink.style.display = 'block';
    adminLink.textContent = '📊 Voir mes enregistrements';
    adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;
  } else if (adminLink) {
    adminLink.style.display = 'none';
  }
}

function logout() {
  fetch("https://couchdb.monproprecloud.fr/_session", {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
    sessionStorage.clear();
    window.location.href = 'login.html';
  }).catch(() => {
    sessionStorage.clear();
    window.location.href = 'login.html';
  });
}

// Gestion de la session au chargement
window.addEventListener("DOMContentLoaded", async () => {
  currentAccount = sessionStorage.getItem('currentAccount');
  const authenticated = sessionStorage.getItem('authenticated');
  const currentServiceName = sessionStorage.getItem('currentServiceName');

  console.log('Session check:', {
    authenticated,
    currentAccount,
    currentServiceName
  });

  if (!currentAccount || !authenticated) {
    console.log('Not authenticated, redirecting to login');
    window.location.href = 'login.html';
    return;
  }

  // Afficher le nom du service
  const userLabel = document.getElementById('currentUserLabel');
  if (userLabel && currentServiceName) {
    userLabel.textContent = currentServiceName;
  }

  // Initialiser la connexion distante
  setupRemoteDB();
  updateUIForUserRole();
  updateUserInterface();
  loadExcelData();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});

function updateUserInterface() {
  const currentServiceName = sessionStorage.getItem('currentServiceName');
  if (currentServiceName) {
    const userLabel = document.getElementById('currentUserLabel');
    if (userLabel) {
      userLabel.textContent = currentServiceName;
    }
  }

  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.style.display = currentAccount === 'Admin' ? 'none' : 'block';
  }
}

// Chargement Excel
function loadExcelData() {
  fetch("modele/stocker_temp.xlsx")
    .then((r) => r.arrayBuffer())
    .then((data) => {
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      excelData = XLSX.utils.sheet_to_json(sheet);

      const designationList = document.getElementById("designationList");
      if (designationList) {
        designationList.innerHTML = '';
      }

      const codeList = document.getElementById("codeProduitList");
      if (codeList) {
        codeList.innerHTML = '';
      }

      const designations = new Set();
      const codes = new Set();

      excelData.forEach((row) => {
        const designation = row["Désignation:"] || row["Désignation"];
        if (designation) designations.add(String(designation).trim());
        const code = row["Code_Produit"];
        if (code) codes.add(String(code).trim());
      });

      if (designationList) {
        designations.forEach(designation => {
          const option = document.createElement("option");
          option.value = designation;
          designationList.appendChild(option);
        });
      }

      if (codeList) {
        codes.forEach(code => {
          const option = document.createElement("option");
          option.value = code;
          codeList.appendChild(option);
        });
      }

      initQRScanner();
      setupEventListeners();
      resetForm();
    })
    .catch((e) => {
      console.error("Erreur chargement Excel :", e);
      alert("Erreur lors du chargement du fichier Excel");
    });
}

// Remplissage du formulaire
function fillFormFromExcel(match) {
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
    if (match[excelKey] !== undefined) {
      const element = document.getElementById(formId);
      if (element) {
        element.value = match[excelKey];
      }
    }
  }

  const axe2Element = document.getElementById("axe2");
  if (axe2Element && (!match["axe2"] || match["axe2"].trim() === "")) {
    axe2Element.value = "SUP=SEMPQRLER";
  }

  const axe1Element = document.getElementById("axe1");
  if (axe1Element) {
    axe1Element.value = currentAccount;
  }

  updateSortieDate();
}

// Écouteurs d'événements
function setupEventListeners() {
  const codeProduitInput = document.getElementById("code_produit");
  if (codeProduitInput) {
    codeProduitInput.addEventListener("input", function() {
      const codeValue = String(this.value).trim().toLowerCase();
      if (codeValue) {
        const match = excelData.find(
          (row) => (row["Code_Produit"] || "").toString().toLowerCase() === codeValue
        );
        if (match) fillFormFromExcel(match);
        else updateSortieDate();
      } else {
        updateSortieDate();
      }
    });
  }

  const designationInput = document.getElementById("designation");
  if (designationInput) {
    designationInput.addEventListener("input", function() {
      const val = String(this.value).trim().toLowerCase();
      const match = excelData.find(
        (row) => (row["Désignation:"] || row["Désignation"] || "").toLowerCase() === val
      );
      if (match) fillFormFromExcel(match);
      else updateSortieDate();
    });
  }
}

// Scanner QR
function initQRScanner() {
  if (typeof Html5Qrcode !== 'undefined' && Html5Qrcode.getCameras) {
    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices && devices.length) {
          qrReader = new Html5Qrcode("qr-reader");
          qrReader.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (text) => {
              if (!isSubmitting) {
                const codeProduitInput = document.getElementById("code_produit");
                if (codeProduitInput) {
                  codeProduitInput.value = text;
                  const product = excelData.find(item => item["Code_Produit"] === text);
                  if (product) fillFormFromExcel(product);
                }
              }
            },
            (err) => console.warn("QR error", err)
          ).catch((err) => console.error("QR init error", err));
        }
      })
      .catch(err => console.error("Camera access error:", err));
  }
}

function stopQRScanner() {
  if (qrReader) {
    qrReader.stop().catch(err => console.error("Failed to stop QR scanner", err));
  }
}

// Gestion des photos
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
  const photoCountEl = document.getElementById("photoCount");
  if (photoCountEl) {
    photoCountEl.textContent = imageFiles.length;
  }
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
          const previewContainer = document.getElementById("previewContainer");
          if (previewContainer) {
            const idx = Array.from(previewContainer.children).indexOf(wrapper);
            if (idx !== -1) {
              imageFiles.splice(idx, 1);
              wrapper.remove();
              updatePhotoCount();
            }
          }
        });
        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        const previewContainer = document.getElementById("previewContainer");
        if (previewContainer) {
          previewContainer.appendChild(wrapper);
        }
        updatePhotoCount();
      };
      reader.readAsDataURL(blob);
    });
  });
}

// Écouteurs pour les photos
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");
const takePhotoBtn = document.getElementById("takePhotoBtn");
const chooseGalleryBtn = document.getElementById("chooseGalleryBtn");

if (cameraInput) cameraInput.addEventListener("change", (e) => handleFiles(e.target.files));
if (galleryInput) galleryInput.addEventListener("change", (e) => handleFiles(e.target.files));
if (takePhotoBtn) takePhotoBtn.addEventListener("click", () => cameraInput.click());
if (chooseGalleryBtn) chooseGalleryBtn.addEventListener("click", () => galleryInput.click());

// Soumission du formulaire
const stockForm = document.getElementById("stockForm");
if (stockForm) {
  stockForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentAccount) {
      alert("Veuillez vous authentifier avant de soumettre le formulaire");
      window.location.href = 'login.html';
      return;
    }

    if (isSubmitting) return;
    isSubmitting = true;

    stopQRScanner();

    const form = new FormData(e.target);
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
      await localDB.put(record);
      alert("Stock enregistré !");
      resetForm();
    } catch (err) {
      console.error("Erreur sauvegarde :", err);
      alert("Erreur lors de l'enregistrement.");
    } finally {
      isSubmitting = false;
      initQRScanner();
    }
  });
}

// Réinitialisation
function resetForm() {
  const stockForm = document.getElementById("stockForm");
  if (stockForm) {
    stockForm.reset();
  }
  imageFiles = [];
  const previewContainer = document.getElementById("previewContainer");
  if (previewContainer) {
    previewContainer.innerHTML = "";
  }
  updatePhotoCount();

  const codeProduit = document.getElementById("code_produit");
  const designation = document.getElementById("designation");
  const axe1 = document.getElementById("axe1");
  const axe2 = document.getElementById("axe2");

  if (codeProduit) codeProduit.value = "";
  if (designation) designation.value = "";
  if (axe1) axe1.value = currentAccount;
  if (axe2) axe2.value = "SUP=SEMPQRLER";
  updateSortieDate();
}

const resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    if (confirm("Voulez-vous vraiment réinitialiser le formulaire ?")) {
      resetForm();
    }
  });
}
