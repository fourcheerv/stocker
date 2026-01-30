let qrReader = null;
let isSubmitting = false;
let imageFiles = [];
let currentAccount = null;
let produitsScannes = [];

/* =======================
   DATABASE
======================= */

const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB(
  "https://access:4G9?r3oKH7tSbCB7rMM9PDpq7L5Yn&tCgE8?qEDD@couchdb.monproprecloud.fr/stocks"
);
localDB.sync(remoteDB, { live: true, retry: true }).on("error", console.error);

/* =======================
   UTILITAIRES
======================= */

function playBeep() {
  const beep = document.getElementById("beep-sound");
  if (beep) {
    beep.currentTime = 0;
    beep.play().catch(() => {});
  }
}

function focusScannerInput() {
  const input = document.getElementById("code_produit");
  if (input) {
    input.focus();
    input.select();
  }
}

/* =======================
   PHOTOS
======================= */

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

function handleFiles(list) {
  const files = Array.from(list);
  if (imageFiles.length + files.length > 3) return alert("Maximum 3 photos !");
  files.forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    compresserImage(file, (blob) => {
      imageFiles.push(blob);
      const reader = new FileReader();
      reader.onload = (e) => {
        const wrap = document.createElement("div");
        wrap.className = "preview-image";
        const img = document.createElement("img");
        img.src = e.target.result;
        const btn = document.createElement("button");
        btn.className = "remove-button";
        btn.textContent = "×";
        btn.onclick = () => {
          const idx = [...wrap.parentNode.children].indexOf(wrap);
          imageFiles.splice(idx, 1);
          wrap.remove();
          updatePhotoCount();
        };
        wrap.append(img, btn);
        document.getElementById("previewContainer").append(wrap);
        updatePhotoCount();
      };
      reader.readAsDataURL(blob);
    });
  });
}

/* =======================
   SCAN
======================= */

function enregistreScan(code) {
  const input = document.getElementById("code_produit");
  input.value = code;
  input.classList.add("grandScan");
  setTimeout(() => input.classList.remove("grandScan"), 800);

  localDB.allDocs({ include_docs: true }).then((docs) => {
    const existant = docs.rows.find(
      (row) =>
        row.doc &&
        row.doc.code_produit === code &&
        row.doc.axe1 === currentAccount
    );

    if (existant) {
      showScanInfo("Code barre déjà scanné", "warning");
      playBeep();
    } else {
      const quantite = 1;
      produitsScannes.push({ code, quantite, ts: new Date().toISOString() });
      majAffichageListeScans();

      // ENREGISTREMENT AUTOMATIQUE IMMÉDIAT (scan direct)
      const record = {
        _id: new Date().toISOString(),
        type: "bobine",
        code_produit: code,
        quantité_consommee: quantite,
        remarques: "",
        axe1: currentAccount,
        photos: [],
      };

      localDB.put(record).then(() => {
        showScanInfo("Code barre enregistré ✅ - Ajouter photos si besoin", "success");
        playBeep();
      });
    }
  });

  input.value = "";
  focusScannerInput();
}

// Fonction SÉPARÉE pour charger depuis l'historique (sans enregistrement automatique)
function loadFromHistory(code) {
  const input = document.getElementById("code_produit");
  input.value = code;
  input.focus();
  
  // Charger les données existantes
  localDB.allDocs({ include_docs: true }).then((docs) => {
    const existing = docs.rows.find(
      (row) =>
        row.doc &&
        row.doc.code_produit === code &&
        row.doc.axe1 === currentAccount
    );
    if (existing && existing.doc) {
      // Remplir les remarques
      document.getElementById("remarques").value = existing.doc.remarques || "";
      // Charger les photos existantes
      if (existing.doc.photos && existing.doc.photos.length > 0) {
        imageFiles = [];
        document.getElementById("previewContainer").innerHTML = "";
        existing.doc.photos.forEach((photoBase64) => {
          const wrapper = document.createElement("div");
          wrapper.className = "preview-image";
          const img = document.createElement("img");
          img.src = photoBase64;
          const btn = document.createElement("button");
          btn.className = "remove-button";
          btn.textContent = "×";
          btn.onclick = (ev) => {
            ev.preventDefault();
            const idx = [...wrapper.parentNode.children].indexOf(wrapper);
            wrapper.remove();
            updatePhotoCount();
          };
          wrapper.append(img, btn);
          document.getElementById("previewContainer").append(wrapper);
        });
        updatePhotoCount();
      }
      showScanInfo(`Code ${code} chargé - Ajouter photos et cliquer "Enregistrer"`, "success");
    } else {
      showScanInfo(`Code ${code} mis en place - Ajouter photos et enregistrer`, "success");
    }
  });
}

function majAffichageListeScans() {
  const ul = document.getElementById("scanListUl");
  if (!ul) return;
  ul.innerHTML = "";
  produitsScannes
    .slice(-10)
    .reverse()
    .forEach((item) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = `Produit ${item.code} — Quantité : ${item.quantite}`;
      link.style.cursor = "pointer";
      link.style.color = "#0c81b4";
      link.style.textDecoration = "underline";
      
      link.onclick = (e) => {
        e.preventDefault();
        // Appeler la fonction loadFromHistory au lieu de enregistreScan
        loadFromHistory(item.code);
      };
      
      li.appendChild(link);
      ul.appendChild(li);
    });
}

function showScanInfo(msg, type = "success") {
  const el = document.getElementById("scan-info");
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === "success" ? "#27ae60" : "#e67e22";
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 2600);
}

/* =======================
   CAMÉRA
======================= */

function initQRScanner() {
  if (!window.Html5Qrcode) return;
  document.getElementById("qr-reader").style.display = "block";

  Html5Qrcode.getCameras().then(() => {
    qrReader = new Html5Qrcode("qr-reader");
    qrReader.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (text) => /^\d+$/.test(text) && enregistreScan(text)
    );
  });
}

function stopQRScanner() {
  document.getElementById("qr-reader").style.display = "none";
  if (qrReader) qrReader.stop().catch(() => {});
}

/* =======================
   RESET
======================= */

function resetForm() {
  // NE PAS réinitialiser code_produit pour permettre de continuer à ajouter des photos au même code
  document.getElementById("remarques").value = "";
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  focusScannerInput();
}

/* =======================
   INIT
======================= */

window.addEventListener("DOMContentLoaded", () => {
  currentAccount = sessionStorage.getItem("currentAccount");
  if (!currentAccount) return (window.location.href = "login.html");

  document.getElementById("axe1").value = currentAccount;
  document.getElementById("currentUserLabel").textContent =
    sessionStorage.getItem("currentServiceName") || currentAccount;

  const adminLink = document.getElementById("adminLink");
  adminLink.style.display = "block";
  adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(
    currentAccount
  )}`;

  document.getElementById("logoutBtn").onclick = () => {
    sessionStorage.clear();
    window.location.href = "login.html";
  };

  const mode = document.getElementById("modeScan");
  const qrDiv = document.getElementById("qr-reader");

  // 🔥 BLUETOOTH PAR DÉFAUT
  mode.value = "bluetooth";
  qrDiv.style.display = "none";
  focusScannerInput();

  mode.onchange = () => {
    if (mode.value === "camera") {
      initQRScanner();
    } else {
      stopQRScanner();
      focusScannerInput();
    }
  };

  document.getElementById("takePhotoBtn").onclick = () =>
    document.getElementById("cameraInput").click();
  document.getElementById("chooseGalleryBtn").onclick = () =>
    document.getElementById("galleryInput").click();
  document.getElementById("cameraInput").onchange = (e) =>
    handleFiles(e.target.files);
  document.getElementById("galleryInput").onchange = (e) =>
    handleFiles(e.target.files);

  // Bouton réinitialiser (vide TOUT incluant le code)
  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      document.getElementById("bobinesForm").reset();
      imageFiles = [];
      document.getElementById("previewContainer").innerHTML = "";
      updatePhotoCount();
      focusScannerInput();
    };
  }

  const codeField = document.getElementById("code_produit");
  codeField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const code = codeField.value.trim();
      if (/^\d+$/.test(code)) enregistreScan(code);
      e.preventDefault();
    }
  });

  document.getElementById("bobinesForm").onsubmit = async (e) => {
    e.preventDefault();
    const code = document.getElementById("code_produit").value.trim();
    if (!/^\d+$/.test(code)) return alert("Code non valide !");
    const quantité_consommee = 1;
    const remarques = document.getElementById("remarques").value.trim();
    const axe1 = currentAccount;

    const photos = [];
    for (const f of imageFiles) {
      const base64 = await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.readAsDataURL(f);
      });
      photos.push(base64);
    }

    let updated = false;
    try {
      const docs = await localDB.allDocs({ include_docs: true });
      const toUpdate = docs.rows.find(
        (row) =>
          row.doc &&
          row.doc.code_produit === code &&
          row.doc.axe1 === currentAccount
      );
      if (toUpdate) {
        toUpdate.doc.remarques = remarques;
        toUpdate.doc.quantité_consommee = quantité_consommee;
        // AJOUT : fusionner les photos (ajouter les nouvelles aux existantes)
        if (photos.length) {
          if (!toUpdate.doc.photos) toUpdate.doc.photos = [];
          toUpdate.doc.photos = toUpdate.doc.photos.concat(photos);
          // Limiter à 3 photos max
          if (toUpdate.doc.photos.length > 3) {
            toUpdate.doc.photos = toUpdate.doc.photos.slice(0, 3);
            showScanInfo("Maximum 3 photos ! Les photos supplémentaires ont été ignorées", "warning");
          }
        }
        await localDB.put(toUpdate.doc);
        showScanInfo("Enregistrement mis à jour ✅", "success");
        updated = true;
        resetForm();
      }
    } catch (err) {
      console.error("Erreur lors de la mise à jour:", err);
      showScanInfo("Erreur lors de la mise à jour", "warning");
      playBeep();
      return;
    }

    if (updated) return;

    const record = {
      _id: new Date().toISOString(),
      type: "bobine",
      code_produit: code,
      quantité_consommee,
      remarques,
      axe1,
      photos,
    };

    try {
      await localDB.put(record);
      showScanInfo("Nouveau code-barres enregistré ✅", "success");
      resetForm();
    } catch {
      showScanInfo("Erreur lors de l'enregistrement", "warning");
    }
  };
});
