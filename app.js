document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("stockForm");
  const photoCountSpan = document.getElementById("photoCount");
  const previewContainer = document.getElementById("previewContainer");

  if (!form || !photoCountSpan || !previewContainer) {
    console.error("Certains éléments HTML nécessaires sont manquants.");
    return;
  }

  // === BASES DE DONNÉES ===
  const localDB = new PouchDB("stocks");
  const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");

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

  // === GESTION DES PHOTOS ===
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

  document.getElementById("takePhotoBtn")?.addEventListener("click", async () => {
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

  document.getElementById("chooseGalleryBtn")?.addEventListener("click", () => {
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
      const codeInput = document.getElementById("code_produit");
      if (codeInput) {
        codeInput.value = qrCodeMessage;
        qrReader.stop();
      }
    },
    error => {
      // Ignorer les erreurs de décodage
    }
  );

  // === CHARGEMENT DES DONNÉES EXCEL POUR AUTO-COMPLÉTION ===
  const designationField = document.getElementById("designation");
  const codeField = document.getElementById("code_produit");
  let excelData = [];

  async function loadExcelData() {
    try {
      const response = await fetch("/stocks.xlsx");
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      excelData = XLSX.utils.sheet_to_json(sheet);

      const datalist = document.createElement("datalist");
      datalist.id = "designationList";
      document.body.appendChild(datalist);

      const uniqueDesignations = [...new Set(excelData.map(row => row["Désignation"]).filter(Boolean))];
      datalist.innerHTML = uniqueDesignations.map(des => `<option value="${des}">`).join("");
      designationField.setAttribute("list", "designationList");
    } catch (err) {
      console.error("Erreur lors du chargement de l'Excel:", err);
    }
  }

  await loadExcelData();

  designationField.addEventListener("change", () => {
    const input = designationField.value.trim().toLowerCase();
    const match = excelData.find(row => row["Désignation"]?.toLowerCase() === input);
    if (match) {
      codeField.value = match["Code produit"] || "";
    }
  });

  // === ENREGISTREMENT FORMULAIRE ===
  form.addEventListener("submit", async e => {
    e.preventDefault();

    if (images.length === 0) {
      alert("Ajoutez au moins une photo.");
      return;
    }

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
