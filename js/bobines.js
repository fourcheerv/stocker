let qrReader = null;
let isSubmitting = false;
let imageFiles = [];
let currentAccount = null;
let produitsScannes = [];
let dernierScanTime = 0;
let dernierScanCode = "";

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
  // Désactiver les boutons photo si 3 photos atteintes
  const takePhotoBtn = document.getElementById("takePhotoBtn");
  const chooseGalleryBtn = document.getElementById("chooseGalleryBtn");
  const isDisabled = imageFiles.length >= 3;
  if (takePhotoBtn) takePhotoBtn.disabled = isDisabled;
  if (chooseGalleryBtn) chooseGalleryBtn.disabled = isDisabled;
  if (takePhotoBtn) takePhotoBtn.style.opacity = isDisabled ? "0.5" : "1";
  if (chooseGalleryBtn) chooseGalleryBtn.style.opacity = isDisabled ? "0.5" : "1";
}

function handleFiles(list) {
  const files = Array.from(list);
  
  // === NOUVEAU : Limite de taille (5MB) ===
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      alert(`Photo trop volumineuse : ${(file.size / 1024 / 1024).toFixed(1)}MB (max 5MB)`);
      return;
    }
  }
  // ========================================
  
  if (imageFiles.length >= 3) {
    alert("Maximum 3 photos atteint !");
    return;
  }
  if (imageFiles.length + files.length > 3) {
    alert(`Maximum 3 photos ! Vous pouvez ajouter ${3 - imageFiles.length} photo(s) seulement.`);
    return;
  }
  files.forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    compresserImage(file, (blob) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // Ajouter l'objet avec dataUrl et flag
        imageFiles.push({ dataUrl: e.target.result, existing: false });
        
        const wrap = document.createElement("div");
        wrap.className = "preview-image";
        const img = document.createElement("img");
        img.src = e.target.result;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "remove-button";
        btn.textContent = "×";
        btn.onclick = (ev) => {
          ev.preventDefault();
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
  // === ANTI-DOUBLON CAMÉRA ===
  const now = Date.now();
  if (code === dernierScanCode && now - dernierScanTime < 2000) {
    console.log("Scan ignoré (trop rapide)");
    return;
  }
  dernierScanCode = code;
  dernierScanTime = now;
  // ============================
  
  // === CONTRÔLE 16 DIGITS ===
  if (!/^\d{16}$/.test(code)) {
    showScanInfo("❌ Code barre invalide - Doit contenir exactement 16 chiffres", "warning");
    playBeep();
    document.getElementById("code_produit").value = "";
    focusScannerInput();
    return;
  }
  // ===========================
  
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
  // === AJOUT : Contrôle 16 digits même pour le chargement historique ===
  if (!/^\d{16}$/.test(code)) {
    showScanInfo("⚠️ Code non conforme (pas 16 chiffres) - Chargement impossible", "warning");
    playBeep();
    return;
  }
  // ===================================================================
  
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
      
      // === CORRECTION : Fusion des photos au lieu d'écrasement ===
      const existingUrls = new Set(imageFiles.map(f => f.dataUrl));
      
      if (existing.doc.photos && existing.doc.photos.length > 0) {
        existing.doc.photos.forEach((photoBase64) => {
          if (!existingUrls.has(photoBase64)) {
            imageFiles.push({ dataUrl: photoBase64, existing: true });
            
            const wrapper = document.createElement("div");
            wrapper.className = "preview-image";
            const img = document.createElement("img");
            img.src = photoBase64;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "remove-button";
            btn.textContent = "×";
            btn.onclick = (ev) => {
              ev.preventDefault();
              const idx = [...wrapper.parentNode.children].indexOf(wrapper);
              imageFiles.splice(idx, 1);
              wrapper.remove();
              updatePhotoCount();
            };
            wrapper.append(img, btn);
            document.getElementById("previewContainer").append(wrapper);
          }
        });
        updatePhotoCount();
      }
      // ============================================================
      
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
  
  // Récupérer tous les documents pour chercher les photos existantes
  localDB.allDocs({ include_docs: true }).then((docs) => {
    // === FILTRAGE : Ne garder que les codes à 16 chiffres ===
    const codesValides = produitsScannes.filter(item => /^\d{16}$/.test(item.code));
    
    codesValides
      .slice(-10)
      .reverse()
      .forEach((item) => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = "#";
        
        // Vérifier si ce code a des photos existantes
        const existingDoc = docs.rows.find(
          (row) =>
            row.doc &&
            row.doc.code_produit === item.code &&
            row.doc.axe1 === currentAccount &&
            row.doc.photos &&
            row.doc.photos.length > 0
        );
        
        const photoIndicator = existingDoc ? "📸 " : "";
        link.textContent = `${photoIndicator}Produit ${item.code} — Quantité : ${item.quantite}`;
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
      (text) => {
        // === CONTRÔLE 16 DIGITS ===
        if (/^\d{16}$/.test(text)) {
          enregistreScan(text);
        } else {
          showScanInfo("❌ Code barre invalide - Doit contenir exactement 16 chiffres", "warning");
          playBeep();
        }
        // ===========================
      }
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

// === CORRECTION : reset avec paramètre keepCode ===
function resetForm(keepCode = true) {
  if (!keepCode) {
    document.getElementById("code_produit").value = "";
  }
  document.getElementById("remarques").value = "";
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  focusScannerInput();
}
// =================================================

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
      // === CORRECTION : Le bouton reset vide le code ===
      document.getElementById("code_produit").value = "";
      focusScannerInput();
    };
  }

  const codeField = document.getElementById("code_produit");
  
  codeField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const code = codeField.value.trim();
      
      // === CONTRÔLE 16 DIGITS (validation unique) ===
      if (!/^\d{16}$/.test(code)) {
        showScanInfo("❌ Code barre invalide - Doit contenir exactement 16 chiffres", "warning");
        playBeep();
        codeField.value = "";
        e.preventDefault();
        return;
      }
      
      // ✅ Code valide - on enregistre directement
      enregistreScan(code);
      e.preventDefault();
    }
  });

  document.getElementById("bobinesForm").onsubmit = async (e) => {
    e.preventDefault();
    const code = document.getElementById("code_produit").value.trim();

    // === CONTRÔLE 16 DIGITS (validation unique) ===
    if (!/^\d{16}$/.test(code)) {
      showScanInfo("❌ Code barre invalide - Doit contenir exactement 16 chiffres", "warning");
      playBeep();
      return;
    }
    
    const quantité_consommee = 1;
    const remarques = document.getElementById("remarques").value.trim();
    const axe1 = currentAccount;

    // Convertir imageFiles en base64 strings
    const photos = [];
    for (const f of imageFiles) {
      // Si c'est un objet avec dataUrl (existant ou nouveau)
      if (f.dataUrl) {
        photos.push(f.dataUrl);
      } else {
        // Sinon, c'est un blob (ancien format)
        const base64 = await new Promise((ok) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.readAsDataURL(f);
        });
        photos.push(base64);
      }
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
        // === CORRECTION : Après mise à jour, on garde le code par défaut ===
        resetForm(true); // Garde le code
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
      // === CORRECTION : Après nouvel enregistrement, on garde le code par défaut ===
      resetForm(true); // Garde le code
    } catch {
      showScanInfo("Erreur lors de l'enregistrement", "warning");
    }
  };
});
