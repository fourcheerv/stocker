document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("stockForm");
  const submitBtn = document.getElementById("submitBtn");
  const photoCountSpan = document.getElementById("photoCount");
  const previewContainer = document.getElementById("previewContainer");
  const designationField = document.getElementById("designation");
  const codeField = document.getElementById("code_produit");
  const excelInput = document.getElementById("excelInput");
  const excelStatus = document.getElementById("excelStatus");

  const localDB = new PouchDB("stocks");
  const remoteDB = new PouchDB("https://couchdb.monproprecloud.fr/stocks", {
    auth: {
      username: "admin",
      password: "M,jvcmHSdl54!" // ⚠️ Idéalement, utilise un token sécurisé via backend
    }
  });

  localDB.sync(remoteDB, {
    live: true,
    retry: true
  }).on("error", err => console.error("Sync error:", err));

  const maxPhotos = 3;
  const images = [];
  let excelData = [];

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

  // QR CODE
  const qrReader = new Html5Qrcode("qr-reader");
  qrReader.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    msg => {
      const codeInput = document.getElementById("code_produit");
      if (codeInput) {
        codeInput.value = msg;
        qrReader.stop();
      }
    },
    () => {} // silence decode errors
  ).catch(err => {
    console.error("Erreur démarrage caméra:", err);
  });

  // CHARGEMENT EXCEL
  excelInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet);
      excelData = rawData.filter(row => row["Désignation"] && row["Code produit"]);
      updateDatalist(excelData.map(row => row["Désignation"]));
      excelStatus.textContent = `${excelData.length} articles chargés`;
    };
    reader.readAsArrayBuffer(file);
  });

  function updateDatalist(values) {
    const list = document.getElementById("designationList");
    list.innerHTML = [...new Set(values)].map(val => `<option value="${val}">`).join("");
  }
 
  designationField.addEventListener("change", () => {
  const input = designationField.value.trim().toLowerCase();
  const match = excelData.find(row =>
    (row["Désignation:"] || "").toLowerCase() === input
  );

  if (!match) return;

  const mapping = {
    "Code Produit": "code_produit",
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
    "axe 1": "axe1",
    "axe 2": "axe2"
  };

  for (const [excelKey, inputId] of Object.entries(mapping)) {
    const el = document.getElementById(inputId);
    if (el && match[excelKey] !== undefined) {
      el.value = match[excelKey];
    }
  }
});



  // ENREGISTREMENT
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (images.length === 0) return alert("Ajoutez au moins une photo.");
    submitBtn.disabled = true;
    submitBtn.textContent = "Enregistrement...";

    const formData = new FormData(form);
    const doc = {};
    formData.forEach((value, key) => {
      doc[key] = value;
    });
    doc._id = new Date().toISOString();
    doc.created_at = new Date().toISOString();
    doc.photos = [...images];

    try {
      await localDB.put(doc);
      alert("Enregistrement réussi !");
      form.reset();
      images.length = 0;
      updatePreview();
    } catch (err) {
      console.error("Erreur d’enregistrement :", err);
      alert("Erreur d’enregistrement.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enregistrer";
    }
  });
});
