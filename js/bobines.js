// Variables globales
let qrReader = null;
let isSubmitting = false;
let imageFiles = [];
let currentAccount = null;
// Fonction pour jouer un bip sonore
function playBeep() {
  const beep = document.getElementById("beep-sound");
  if (beep) {
    beep.currentTime = 0; // Redémarre le son à chaque déclenchement
    beep.play().catch((err) => console.warn("Lecture du bip bloquée (autoplay) :", err));
  }
}


// Configuration PouchDB
const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");

// Synchronisation
localDB.sync(remoteDB, { live: true, retry: true })
  .on("error", (err) => console.error("Erreur de sync:", err));

// Compression d'image (qualité abaissée à 0.6 pour alléger les fichiers)
function compresserImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxWidth = 800;
      canvas.width = maxWidth;
      canvas.height = (img.height / img.width) * maxWidth;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

      // Réduction de qualité pour stabilité sync PouchDB
      canvas.toBlob(callback, "image/jpeg", 0.6);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Mise à jour du compteur de photos
function updatePhotoCount() {
  document.getElementById("photoCount").textContent = imageFiles.length;
}

// Gestion des fichiers photos
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
        removeBtn.textContent = "×";
        removeBtn.onclick = () => {
          const idx = [...document.getElementById("previewContainer").children].indexOf(wrapper);
          if (idx !== -1) {
            imageFiles.splice(idx, 1);
            wrapper.remove();
            updatePhotoCount();
          }
        };

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        document.getElementById("previewContainer").appendChild(wrapper);
        updatePhotoCount();
      };
      reader.readAsDataURL(blob);
    });
  });
}

// Initialisation du scanner QR
function initQRScanner() {
  if (!window.Html5Qrcode) return;
  Html5Qrcode.getCameras()
    .then((devices) => {
      if (devices && devices.length) {
        qrReader = new Html5Qrcode("qr-reader");
        qrReader.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            if (!isSubmitting && /^\d+$/.test(text)) {
              document.getElementById("code_produit").value = text;
            } else if (!isSubmitting && text) {
              alert("Le code scanné doit être uniquement numérique !");
            }
          },
          () => {}
        ).catch((err) => console.warn("Erreur de démarrage QR:", err));
      } else {
        document.getElementById("qr-reader").innerHTML = "📷 Caméra non détectée.";
      }
    })
    .catch((err) => console.error("Erreur caméra:", err));
}

function stopQRScanner() {
  if (qrReader) qrReader.stop().catch(console.warn);
}

// Réinitialisation du formulaire
function resetForm() {
  document.getElementById("bobinesForm").reset();
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  document.getElementById("success").style.display = "none";
  document.getElementById("quantité_consommee").value = "1";
}

// Déconnexion
function logout() {
  sessionStorage.clear();
  window.location.href = "login.html";
}

// Initialisation principale
window.addEventListener("DOMContentLoaded", () => {
  currentAccount = sessionStorage.getItem("currentAccount");
  if (!currentAccount) {
    window.location.href = "login.html";
    return;
  }

  // Configuration utilisateur
  document.getElementById("axe1").value = currentAccount;
  document.getElementById("quantité_consommee").value = "1";
  document.getElementById("currentUserLabel").textContent =
    sessionStorage.getItem("currentServiceName") || currentAccount;

  // Lien admin
  const adminLink = document.getElementById("adminLink");
  adminLink.style.display = "block";
  adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;

  // Déconnexion
  document.getElementById("logoutBtn").addEventListener("click", logout);

  // Mode Scan Bluetooth ou Caméra
  const modeSelect = document.getElementById("modeScan");
  modeSelect.addEventListener("change", (e) => {
    if (e.target.value === "camera") {
      document.getElementById("qr-reader").style.display = "block";
      initQRScanner();
    } else {
      document.getElementById("qr-reader").style.display = "none";
      stopQRScanner();
      alert("Mode Bluetooth activé : scannez avec votre douchette, le code sera saisi automatiquement.");
    }
  });

  // Initialisation caméra par défaut
  initQRScanner();

  // Gestion des photos
  document.getElementById("takePhotoBtn").onclick = () => document.getElementById("cameraInput").click();
  document.getElementById("chooseGalleryBtn").onclick = () => document.getElementById("galleryInput").click();
  document.getElementById("cameraInput").onchange = (e) => handleFiles(e.target.files);
  document.getElementById("galleryInput").onchange = (e) => handleFiles(e.target.files);

  // Soumission du formulaire
  document.getElementById("bobinesForm").onsubmit = async (e) => {
    e.preventDefault();

    const code = document.getElementById("code_produit").value.trim();
    if (!/^\d+$/.test(code)) {
      alert("Le code produit doit être strictement composé de chiffres !");
      isSubmitting = false;
      initQRScanner();
      return;
    }

    const quantité_consommee = parseInt(document.getElementById("quantité_consommee").value) || 1;
    const remarques = document.getElementById("remarques").value.trim();
    const axe1 = currentAccount;

    // Conversion des photos
    let photos = [];
    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        photos.push(base64);
      }
    }

    const record = {
      _id: new Date().toISOString(),
      type: "bobine",
      code_produit: code,
      quantité_consommee,
      remarques,
      axe1,
      photos
    };

    // Enregistrement dans PouchDB avec gestion d'erreurs
    try {
      const response = await localDB.put(record);

      if (!response.ok && !response.id) throw new Error("Erreur interne.");
      alert("Stock enregistré avec succès !");
      resetForm();

    } catch (err) {
      console.warn("Erreur détectée:", err);

      if (err.message.includes("timeout") || err.message.includes("unexpected end of JSON")) {
        alert("Photo enregistrée, mais PouchDB a signalé une erreur de réception.");
      } else {
        alert("Erreur réelle lors de l'enregistrement.");
        console.error("Erreur réelle:", err);
      }

    } finally {
      isSubmitting = false;
      if (modeSelect.value === "camera") initQRScanner();
    }
  };
});
