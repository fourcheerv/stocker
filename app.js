document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("stockForm");
  const localDB = new PouchDB("stocks");

  const remoteURL = "https://couchdb.monproprecloud.fr/stocks";
  const loginURL = "https://couchdb.monproprecloud.fr/_session";

  // Authentification par session (cookie)
  try {
    const loginRes = await fetch(loginURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=admin&password=M,jvcmHSdl54!",
      credentials: "include"  // Important pour inclure les cookies
    });

    if (!loginRes.ok) {
      alert("Échec de l'authentification CouchDB.");
      return;
    }

    // Créer remoteDB avec fetch personnalisé qui inclut les credentials
    const remoteDB = new PouchDB(remoteURL, {
      fetch: (url, opts) => {
        return fetch(url, {
          ...opts,
          credentials: "include"  // Pour inclure les cookies de session
        });
      }
    });

    // Synchronisation live
    localDB.sync(remoteDB, {
      live: true,
      retry: true
    })
    .on("change", info => console.log("Sync change:", info))
    .on("paused", info => console.log("Sync paused:", info))
    .on("active", () => console.log("Sync active"))
    .on("denied", err => console.error("Sync denied:", err))
    .on("complete", info => console.log("Sync complete:", info))
    .on("error", err => console.error("Sync error:", err));

  } catch (e) {
    console.error("Erreur de connexion CouchDB :", e);
  }


  // === GESTION DES PHOTOS ===
  const photoCountSpan = document.getElementById("photoCount");
  const previewContainer = document.getElementById("previewContainer");
  const maxPhotos = 3;
  const images = [];

  function updatePreview() {
    previewContainer.innerHTML = "";
    images.forEach((dataUrl, index) => {
      const div = document.createElement("div");
      div.className = "preview-image";
      div.innerHTML = `
        <img src="${dataUrl}" alt="Photo ${index + 1}">
        <button class="remove-button" data-index="${index}">×</button>
      `;
      previewContainer.appendChild(div);
    });
    photoCountSpan.textContent = images.length;
  }

  function addImage(dataUrl) {
    if (images.length < maxPhotos) {
      images.push(dataUrl);
      updatePreview();
    } else {
      alert("Maximum 3 photos.");
    }
  }

  document.getElementById("takePhotoBtn").addEventListener("click", async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => addImage(e.target.result);
      reader.readAsDataURL(file);
    };
    input.click();
  });

  document.getElementById("chooseGalleryBtn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => addImage(e.target.result);
      reader.readAsDataURL(file);
    };
    input.click();
  });

  previewContainer.addEventListener("click", e => {
    if (e.target.classList.contains("remove-button")) {
      const index = parseInt(e.target.dataset.index);
      images.splice(index, 1);
      updatePreview();
    }
  });

  // === SCAN CODE BARRES ===
  const qrReader = new Html5Qrcode("qr-reader");
  qrReader.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    qrCodeMessage => {
      document.getElementById("code_produit").value = qrCodeMessage;
      qrReader.stop();
    },
    error => { /* Ignore decode errors */ }
  );

  // === ENREGISTREMENT FORMULAIRE ===
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const formData = new FormData(form);
    const doc = {};
    formData.forEach((value, key) => doc[key] = value);
    doc._id = new Date().toISOString();
    doc.photos = images;

    try {
      await localDB.put(doc);
      alert("Enregistrement réussi !");
      form.reset();
      images.length = 0;
      updatePreview();
    } catch (err) {
      console.error("Erreur d’enregistrement :", err);
      alert("Erreur d’enregistrement.");
    }
  });
});
