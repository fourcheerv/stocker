// Variables globales
let excelData = [];
let imageFiles = [];
let qrReader = null;
let isSubmitting = false;
let currentAccount = null;

const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");

localDB.sync(remoteDB, { live: true, retry: true }).on("error", console.error);

// === Gestion de la session ===
window.addEventListener("DOMContentLoaded", () => {
  currentAccount = sessionStorage.getItem('currentAccount');
  
  if (!currentAccount) {
    window.location.href = 'login.html';
    return;
  }
  
  // Mapper le code du compte à un nom lisible
  const accountNames = {
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
    'NEUTRE': 'Compte Neutre'
  };
  
  document.getElementById('current-account').textContent = 
    accountNames[currentAccount] || currentAccount;
  
  document.getElementById('axe1').value = currentAccount;
  loadExcelData();
});

// === Déconnexion ===
document.getElementById('logoutBtn').addEventListener('click', () => {
  // Réinitialiser l'application
  resetForm();
  
  // Supprimer le compte de sessionStorage
  sessionStorage.removeItem('currentAccount');
  
  // Rediriger vers la page de login
  window.location.href = 'login.html';
});

// === Chargement Excel ===
function loadExcelData() {
  fetch("stocker_temp.xlsx")
    .then((r) => r.arrayBuffer())
    .then((data) => {
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      excelData = XLSX.utils.sheet_to_json(sheet);
      
      // Initialiser la liste des désignations (sans filtre par compte)
      const list = document.getElementById("designationList");
      list.innerHTML = ''; // Vider la liste
      
      excelData.forEach((row) => {
        if (row["Désignation:"]) {
          const opt = document.createElement("option");
          opt.value = row["Désignation:"];
          list.appendChild(opt);
        }
      });
      
      // Initialiser le scanner QR
      initQRScanner();
    })
    .catch((e) => console.error("Erreur chargement Excel :", e));
}

// === Initialisation du scanner QR ===
function initQRScanner() {
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
                document.getElementById("code_produit").value = text;
              }
            },
            (err) => console.warn("QR error", err)
          ).catch((err) => console.error("QR init error", err));
        } else {
          console.log("No cameras found");
        }
      })
      .catch(err => console.error("Camera access error:", err));
  }
}

// === Fonction pour arrêter le scanner QR ===
function stopQRScanner() {
  if (qrReader) {
    qrReader.stop().then(() => {
      console.log("QR Scanner stopped");
    }).catch(err => console.error("Failed to stop QR scanner", err));
  }
}

// === Auto-remplissage par désignation ===
document.getElementById("designation").addEventListener("change", () => {
  const val = document.getElementById("designation").value.trim().toLowerCase();
  const match = excelData.find(
    (row) => (row["Désignation:"] || "").toLowerCase() === val
  );

  if (!match) return;

  const map = {
    "Code_Produit": "code_produit",
    "Quantité_Consommée": "quantité_consommee",
    "unité(s)": "unites",
    "A Commander": "a_commander",
    "Remarques:": "remarques",
    "Magasin": "magasin",
    "Stock initial": "stock_initial",
    "Stock final": "stock_final",
    "seuil de commande": "seuil_de_commande",
    "Section employeur": "section_employeur",
    "emplacement de stockage": "emplacement_de_stockage",
    "quantité en stock": "quantite_en_stock",
    "quantité théorique": "quantite_theorique",
    "Date de sortie": "date_sortie",
    "axe2": "axe2"
  };

  for (const [key, id] of Object.entries(map)) {
    if (match[key] !== undefined) {
      if (key === "Date de sortie") {
        // Formater la date au format fr-FR
        const date = new Date(match[key]);
        if (!isNaN(date.getTime())) {
          const formattedDate = date.toLocaleString('fr-FR', {
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit', 
            minute: '2-digit'
          });
          document.getElementById(id).value = formattedDate;
        }
      } else {
        document.getElementById(id).value = match[key];
      }
    }
  }
  
  // Mettre à jour axe1 avec la valeur du compte courant
  document.getElementById("axe1").value = currentAccount;
});

// === Gestion Photos ===
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

document.getElementById("cameraInput").addEventListener("change", (e) =>
  handleFiles(e.target.files)
);
document.getElementById("galleryInput").addEventListener("change", (e) =>
  handleFiles(e.target.files)
);
document.getElementById("takePhotoBtn").addEventListener("click", () =>
  document.getElementById("cameraInput").click()
);
document.getElementById("chooseGalleryBtn").addEventListener("click", () =>
  document.getElementById("galleryInput").click()
);

// === Soumission du formulaire ===
document.getElementById("stockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  if (!currentAccount) {
    alert("Veuillez vous authentifier avant de soumettre le formulaire");
    return;
  }
  
  if (isSubmitting) return;
  isSubmitting = true;
  
  if (imageFiles.length === 0) {
    alert("Ajoutez au moins une photo.");
    isSubmitting = false;
    return;
  }

  // Arrêter le scanner QR pendant le traitement
  stopQRScanner();

  const form = new FormData(e.target);
  const record = { _id: new Date().toISOString(), photos: [] };

  // Traiter chaque champ du formulaire
  form.forEach((val, key) => {
    // Formater spécifiquement la date de sortie
    if (key === "date_sortie") {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        record[key] = date.toLocaleString('fr-FR', {
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit', 
          minute: '2-digit'
        });
      } else {
        record[key] = val; // Garder la valeur originale si ce n'est pas une date valide
      }
    } else {
      record[key] = val;
    }
  });

  // Traitement images (converties en base64)
  for (const file of imageFiles) {
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    record.photos.push(base64);
  }

  try {
    await localDB.put(record);
    alert("Stock enregistré !");
    
    // Réinitialisation complète
    resetForm();
    
  } catch (err) {
    console.error("Erreur sauvegarde :", err);
    alert("Erreur lors de l'enregistrement.");
  } finally {
    isSubmitting = false;
    // Redémarrer le scanner après traitement
    initQRScanner();
  }
});

// === Réinitialisation du formulaire ===
function resetForm() {
  document.getElementById("stockForm").reset();
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  
  // Réinitialiser le code produit
  document.getElementById("code_produit").value = "";
  
  // Réinitialiser la liste d'autocomplétion
  document.getElementById("designation").value = "";
  
  // Remettre le compte actuel
  document.getElementById("axe1").value = currentAccount;
}

// === Bouton de réinitialisation ===
document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Voulez-vous vraiment réinitialiser le formulaire ?")) {
    resetForm();
  }
});