let qrReader = null;
let isSubmitting = false;
let imageFiles = [];
let currentAccount = null;
let produitsScannes = []; // Liste session (affiché)

const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");
localDB.sync(remoteDB, { live: true, retry: true }).on("error", console.error);

function playBeep() {
  const beep = document.getElementById("beep-sound");
  if (beep) {
    beep.currentTime = 0;
    beep.play().catch(() => {});
  }
}

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

function enregistreScan(code) {
  document.getElementById("code_produit").value = code;
  document.getElementById("code_produit").classList.add("grandScan");
  setTimeout(()=>document.getElementById("code_produit").classList.remove("grandScan"), 900);

  const existant = produitsScannes.find(item => item.code === code);
  if (existant) {
    showScanInfo("Code barre déjà scanné, pas de mise à jour", "warning");
    playBeep();
    return;
  }

  let quantite = 1;
  produitsScannes.push({ code, quantite, ts: new Date().toISOString() });
  majAffichageListeScans();

  const record = JSON.parse(JSON.stringify({
    _id: new Date().toISOString(),
    type: "bobine",
    code_produit: code,
    quantité_consommee: quantite,
    remarques: "",
    axe1: currentAccount,
    photos: [],
  }));
  localDB.put(record).catch(console.warn);

  showScanInfo("Nouveau code-barres enregistré ✅", "success");
  playBeep();
}

function majAffichageListeScans() {
  const ul = document.getElementById("scanListUl");
  if (!ul) return;
  ul.innerHTML = "";
  produitsScannes.slice(-10).reverse().forEach(item => {
    const li = document.createElement("li");
    li.textContent = `Produit ${item.code} — Quantité : ${item.quantite}`;
    ul.appendChild(li);
  });
}

function showScanInfo(msg, type="success") {
  const el = document.getElementById("scan-info");
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === "success" ? "#27ae60" : "#e67e22";
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 5200);
}

function initQRScanner() {
  if (!window.Html5Qrcode) return;
  Html5Qrcode.getCameras().then((devices) => {
    if (devices.length) {
      qrReader = new Html5Qrcode("qr-reader");
      qrReader.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          if (/^\d+$/.test(text)) {
            enregistreScan(text);
          }
        }
      );
    }
  });
}
function stopQRScanner() {
  if (qrReader) qrReader.stop().catch(() => {});
}

function resetForm() {
  document.getElementById("bobinesForm").reset();
  imageFiles = [];
  document.getElementById("previewContainer").innerHTML = "";
  updatePhotoCount();
  const successDiv = document.getElementById("success");
  if (successDiv) successDiv.style.display = "none";
}

window.addEventListener("DOMContentLoaded", () => {
  currentAccount = sessionStorage.getItem("currentAccount");
  if (!currentAccount) return (window.location.href = "login.html");
  document.getElementById("axe1").value = currentAccount;
  document.getElementById("currentUserLabel").textContent =
    sessionStorage.getItem("currentServiceName") || currentAccount;

  const adminLink = document.getElementById("adminLink");
  adminLink.style.display = "block";
  adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;

  document.getElementById("logoutBtn").onclick = () =>
    (sessionStorage.clear(), (window.location.href = "login.html"));

  const mode = document.getElementById("modeScan");
  mode.onchange = (e) => (e.target.value === "camera" ? initQRScanner() : stopQRScanner());
  initQRScanner();

  document.getElementById("takePhotoBtn").onclick = () =>
    document.getElementById("cameraInput").click();
  document.getElementById("chooseGalleryBtn").onclick = () =>
    document.getElementById("galleryInput").click();
  document.getElementById("cameraInput").onchange = (e) => handleFiles(e.target.files);
  document.getElementById("galleryInput").onchange = (e) => handleFiles(e.target.files);

  const codeField = document.getElementById("code_produit");
  let last = 0;
  codeField.addEventListener("input", () => {
    const code = codeField.value.trim();
    const now = Date.now();
    if (now - last < 100 && /^\d+$/.test(code)) {
      enregistreScan(code);
    }
    last = now;
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

    // Mise à jour si déjà scanné, sinon création
    const existing = produitsScannes.find(item => item.code === code);
    if (existing) {
      try {
        const docs = await localDB.allDocs({ include_docs: true });
        let toUpdate = docs.rows.find(row =>
          row.doc &&
          row.doc.code_produit === code &&
          row.doc.axe1 === currentAccount
        );
        if (toUpdate) {
          toUpdate.doc.remarques = remarques;
          toUpdate.doc.quantité_consommee = quantité_consommee;
          if (photos.length > 0) toUpdate.doc.photos = photos;
          await localDB.put(toUpdate.doc);
          showScanInfo("Votre modification a bien été enregistrée ✅", "success");
          resetForm();
        } else {
          showScanInfo("Aucune entrée trouvée à mettre à jour !", "warning");
        }
      } catch (err) {
        showScanInfo("Erreur lors de la mise à jour !", "warning");
      }
      playBeep();
      return;
    }

    // Si création
    produitsScannes.push({ code, quantite: quantité_consommee, ts: new Date().toISOString() });
    majAffichageListeScans();

    const record = JSON.parse(
      JSON.stringify({
        _id: new Date().toISOString(),
        type: "bobine",
        code_produit: code,
        quantité_consommee,
        remarques,
        axe1,
        photos,
      })
    );

    try {
      const res = await localDB.put(record);
      if (!res.ok && !res.id) throw new Error();
      showScanInfo("Nouveau code-barres enregistré ✅", "success");
      resetForm();
    } catch (err) {
      if (
        err.name === "invalid_json" ||
        err.name === "unknown_error" ||
        (err.message && err.message.includes("JSON"))
      ) {
        alert(
          "Enregistrement réussi localement malgré erreur distante (accent)."
        );
      } else {
        showScanInfo("Erreur lors de l'enregistrement !", "warning");
      }
    }
  };
});
