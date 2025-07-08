// Variables globales
let excelData = [];
let imageFiles = [];
let qrReader = null;
let isSubmitting = false;
let currentAccount = null;

const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");

localDB.sync(remoteDB, { live: true, retry: true }).on("error", (err) => {
  console.error("Erreur synchronisation:", err);
});

// === Gestion de la session ===
window.addEventListener("DOMContentLoaded", async () => {
  currentAccount = sessionStorage.getItem('currentAccount');
  
  if (!currentAccount) {
    window.location.href = 'login.html';
    return;
  }

  // Mapper le code du compte
  const accountNames = {
    'SCT=E260329': 'SCE Informations Sportives',
    // ... (autres comptes)
  };
  
  document.getElementById('current-account').textContent = 
    accountNames[currentAccount] || currentAccount;
  
  document.getElementById('axe1').value = currentAccount;
  
  try {
    await loadExcelData();
    await initQRScanner(); // Initialisation après consentement
  } catch (err) {
    console.error("Initialisation erreur:", err);
  }
});

// === Chargement Excel avec nettoyage des données ===
async function loadExcelData() {
  try {
    const response = await fetch("stocker_temp.xlsx");
    const data = await response.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Nettoyage des données
    excelData = XLSX.utils.sheet_to_json(sheet).map(row => {
      const cleanRow = {};
      Object.entries(row).forEach(([key, value]) => {
        const cleanKey = key.trim().replace(/"/g, '');
        cleanRow[cleanKey] = value !== undefined ? value : "";
      });
      return cleanRow;
    });

    // Debug colonnes
    console.log("Colonnes disponibles:", Object.keys(excelData[0]));

    // Remplissage liste désignations
    const list = document.getElementById("designationList");
    list.innerHTML = '';
    excelData.forEach(row => {
      if (row.Désignation) {
        const opt = document.createElement("option");
        opt.value = row.Désignation;
        list.appendChild(opt);
      }
    });

  } catch (err) {
    console.error("Erreur chargement Excel:", err);
    throw err;
  }
}

// === Gestion Camera avec permissions ===
async function initQRScanner() {
  if (!window.Html5Qrcode) {
    console.warn("Bibliothèque QR non chargée");
    return;
  }

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras && cameras.length) {
      qrReader = new Html5Qrcode("qr-reader");
      
      // Options de configuration
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      try {
        await qrReader.start(
          { facingMode: "environment" },
          config,
          (text) => {
            const codeInput = document.getElementById("code_produit");
            if (codeInput && !isSubmitting) {
              codeInput.value = text;
            }
          },
          (err) => console.warn("Erreur scan QR:", err)
        );
      } catch (startErr) {
        console.error("Erreur démarrage caméra:", startErr);
        showCameraError();
      }
    } else {
      console.log("Aucune caméra détectée");
    }
  } catch (permissionErr) {
    console.error("Erreur permission caméra:", permissionErr);
    showCameraError();
  }
}

function showCameraError() {
  const qrContainer = document.getElementById("qr-reader");
  if (qrContainer) {
    qrContainer.innerHTML = `
      <div class="camera-error">
        <p>Accès caméra bloqué. Veuillez autoriser les permissions.</p>
        <button id="retry-camera">Réessayer</button>
      </div>
    `;
    document.getElementById("retry-camera").addEventListener("click", initQRScanner);
  }
}

// === Auto-remplissage robuste ===
document.getElementById("designation").addEventListener("change", function() {
  const val = this.value.trim().toLowerCase();
  const match = excelData.find(row => 
    (row.Désignation || "").toLowerCase() === val
  );

  if (!match) return;

  // Mapping avec valeurs par défaut
  const fieldMap = [
    { excel: "Code_Produit", html: "code_produit" },
    { excel: "Quantité_Consommée", html: "quantité_consommee" },
    // ... autres champs
    { 
      excel: "axe2", 
      html: "axe2",
      default: "SUP=SEMPQRLER" 
    }
  ];

  fieldMap.forEach(({excel, html, default: defaultValue}) => {
    const input = document.getElementById(html);
    if (!input) {
      console.warn(`Champ ${html} non trouvé`);
      return;
    }

    let value = match[excel] ?? defaultValue;
    
    // Conversion des nombres avec espaces
    if (typeof value === 'string' && /quantité|Stock/i.test(excel)) {
      value = value.replace(/\s/g, '');
    }

    input.value = value || defaultValue;
  });

  // Debug axe2
  console.log("Debug axe2:", {
    valeurTrouvee: match.axe2,
    valeurAppliquee: document.getElementById("axe2").value
  });
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

  stopQRScanner();

  const form = new FormData(e.target);
  const record = { _id: new Date().toISOString(), photos: [] };

  form.forEach((val, key) => {
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
        record[key] = val;
      }
    } else {
      record[key] = val;
    }
  });

  // Traitement images seulement si elles existent
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

// === Réinitialisation du formulaire ===
function resetForm() {
  document.getElementById("stockForm").reset();
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  document.getElementById("code_produit").value = "";
  document.getElementById("designation").value = "";
  document.getElementById("axe1").value = currentAccount;
}

// === Bouton de réinitialisation ===
document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Voulez-vous vraiment réinitialiser le formulaire ?")) {
    resetForm();
  }
});