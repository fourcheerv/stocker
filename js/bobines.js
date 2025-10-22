// Variables globales
let qrReader = null;
let isSubmitting = false;
let imageFiles = [];
let currentAccount = null;

// Configuration PouchDB
const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");

// Synchronisation
localDB.sync(remoteDB, { live: true, retry: true })
  .on("error", (err) => console.error("Erreur de sync:", err));

// Fonction bip sonore
function playBeep() {
  const beep = document.getElementById("beep-sound");
  if (beep) {
    beep.currentTime = 0;
    beep.play().catch(() => {}); // ignore blocage autoplay
  }
}

// Compression image (qualité 0.6)
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
      canvas.toBlob(callback, "image/jpeg", 0.6);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updatePhotoCount() {
  document.getElementById("photoCount").textContent = imageFiles.length;
}

// Gestion des photos
function handleFiles(list) {
  const files = Array.from(list);
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
        const btn = document.createElement("button");
        btn.className = "remove-button";
        btn.textContent = "×";
        btn.onclick = () => {
          const idx = [...document.getElementById("previewContainer").children].indexOf(wrapper);
          if (idx !== -1) {
            imageFiles.splice(idx, 1);
            wrapper.remove();
            updatePhotoCount();
          }
        };
        wrapper.append(img, btn);
        document.getElementById("previewContainer").append(wrapper);
        updatePhotoCount();
      };
      reader.readAsDataURL(blob);
    });
  });
}

// QR Scanner
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
              playBeep(); // bip sur scan cam
            } else if (!isSubmitting && text) {
              alert("Le code scanné doit être uniquement numérique !");
            }
          },
          (err) => {}
        ).catch((err) => console.warn("QR start error:", err));
      } else {
        document.getElementById("qr-reader").innerHTML = "📷 Caméra non détectée.";
      }
    })
    .catch((err) => console.error("Erreur caméra:", err));
}

function stopQRScanner() {
  if (qrReader) qrReader.stop().catch(console.warn);
}

// Réinitialiser
function resetForm() {
  document.getElementById("bobinesForm").reset();
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  document.getElementById("success").style.display = "none";
  document.getElementById("quantite_consommee").value = "1";
}

// Déconnexion
function logout() {
  sessionStorage.clear();
  window.location.href = "login.html";
}

// Initialisation
window.addEventListener("DOMContentLoaded", () => {
  currentAccount = sessionStorage.getItem("currentAccount");
  if (!currentAccount) {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("axe1").value = currentAccount;
  document.getElementById("quantite_consommee").value = "1";
  document.getElementById("currentUserLabel").textContent =
    sessionStorage.getItem("currentServiceName") || currentAccount;

  const adminLink = document.getElementById("adminLink");
  adminLink.style.display = "block";
  adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;
  document.getElementById("logoutBtn").addEventListener("click", logout);

  // Sélection du mode
  const modeSelect = document.getElementById("modeScan");
  modeSelect.addEventListener("change", (e) => {
    if (e.target.value === "camera") {
      document.getElementById("qr-reader").style.display = "block";
      initQRScanner();
    } else {
      document.getElementById("qr-reader").style.display = "none";
      stopQRScanner();
      alert("Mode Bluetooth activé : scannez avec la douchette.");
    }
  });

  initQRScanner();

  // Photos
  document.getElementById("takePhotoBtn").onclick = () => document.getElementById("cameraInput").click();
  document.getElementById("chooseGalleryBtn").onclick = () => document.getElementById("galleryInput").click();
  document.getElementById("cameraInput").onchange = (e) => handleFiles(e.target.files);
  document.getElementById("galleryInput").onchange = (e) => handleFiles(e.target.files);

  // Bip mode Bluetooth (saisie rapide)
  const codeInput = document.getElementById("code_produit");
  let lastInput = 0;
  codeInput.addEventListener("input", () => {
    const now = Date.now();
    if (now - lastInput < 100) playBeep();
    lastInput = now;
  });

  // Soumission
  document.getElementById("bobinesForm").onsubmit = async (e) => {
    e.preventDefault();

    const code = document.getElementById("code_produit").value.trim();
    if (!/^\d+$/.test(code)) {
      alert("Le code produit doit être numérique !");
      initQRScanner();
      return;
    }

    const quantite_consommee = parseInt(document.getElementById("quantite_consommee").value) || 1;
    const remarques = document.getElementById("remarques").value.trim();
    const axe1 = currentAccount;

    // Convertir les photos
    let photos = [];
    for (const file of imageFiles) {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      photos.push(base64);
    }

    const record = {
      _id: new Date().toISOString(),
      type: "bobine",
      code_produit: code,
      quantite_consommee,
      remarques,
      axe1,
      photos
    };

    try {
      const response = await localDB.put(record);
      if (!response.ok && !response.id) throw new Error("Erreur interne");

      playBeep(); // bip sauvegarde réussite
      document.getElementById("success").style.display = "block";
      alert("Stock enregistré !");
      resetForm();

    } catch (err) {
      console.warn("Erreur détectée:", err);
      if (err.message.includes("timeout") || err.message.includes("unexpected end of JSON")) {
        alert("Photo enregistrée localement, mais PouchDB a signalé une erreur.");
      } else {
        alert("Erreur réelle lors de l'enregistrement.");
      }
    } finally {
      isSubmitting = false;
      if (modeSelect.value === "camera") initQRScanner();
    }
  };
});
