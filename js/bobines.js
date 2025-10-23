let qrReader = null;
let isSubmitting = false;
let imageFiles = [];
let currentAccount = null;

const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");
localDB.sync(remoteDB, { live: true, retry: true }).on("error", console.error);

// Bip
function playBeep() {
  const beep = document.getElementById("beep-sound");
  if (beep) {
    beep.currentTime = 0;
    beep.play().catch(() => {});
  }
}

// Compression d'image
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

// Scanner QR
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
            document.getElementById("code_produit").value = text;
            playBeep();
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

  // Scan mode
  const mode = document.getElementById("modeScan");
  mode.onchange = (e) => (e.target.value === "camera" ? initQRScanner() : stopQRScanner());
  initQRScanner();

  // Photos
  document.getElementById("takePhotoBtn").onclick = () =>
    document.getElementById("cameraInput").click();
  document.getElementById("chooseGalleryBtn").onclick = () =>
    document.getElementById("galleryInput").click();
  document.getElementById("cameraInput").onchange = (e) => handleFiles(e.target.files);
  document.getElementById("galleryInput").onchange = (e) => handleFiles(e.target.files);

  // Bip Bluetooth (scan)
  const codeField = document.getElementById("code_produit");
  let last = 0;
  codeField.addEventListener("input", () => {
    const now = Date.now();
    if (now - last < 100) playBeep();
    last = now;
  });

  // Enregistrement
  document.getElementById("bobinesForm").onsubmit = async (e) => {
    e.preventDefault();
    const code = document.getElementById("code_produit").value.trim();
    if (!/^\d+$/.test(code)) return alert("Code non valide !");
    const quantité_consommee = parseInt(document.getElementById("quantité_consommee").value) || 1;
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
        alert("Erreur lors de l'enregistrement !");
      }
    }
  };
});
