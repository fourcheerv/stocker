let excelData = [];
let imageFiles = [];

const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:M,jvcmHSdl54!@couchdb.monproprecloud.fr/stocks");

localDB.sync(remoteDB, { live: true, retry: true }).on("error", console.error);

// === Chargement Excel ===
window.addEventListener("DOMContentLoaded", () => {
  fetch("stocker_temp.xlsx")
    .then((r) => r.arrayBuffer())
    .then((data) => {
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      excelData = XLSX.utils.sheet_to_json(sheet);
      const list = document.getElementById("designationList");
      excelData.forEach((row) => {
        if (row["Désignation:"]) {
          const opt = document.createElement("option");
          opt.value = row["Désignation:"];
          list.appendChild(opt);
        }
      });
    })
    .catch((e) => console.error("Erreur chargement Excel :", e));
});

// === Auto-remplissage par désignation ===
document.getElementById("designation").addEventListener("change", () => {
  const val = document.getElementById("designation").value.trim().toLowerCase();
  const match = excelData.find(
    (row) => (row["Désignation:"] || "").toLowerCase() === val
  );

  if (!match) return;

  const map = {
    "Code_Produit": "code_produit",
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
    "axe1": "axe1",
    "axe2": "axe2"
  };

  for (const [key, id] of Object.entries(map)) {
    if (match[key] !== undefined) {
      document.getElementById(id).value = match[key];
    }
  }
});

// === QR Code ===
const qrReader = new Html5Qrcode("qr-reader");
qrReader
  .start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (text) => (document.getElementById("code_produit").value = text),
    (err) => console.warn("QR error", err)
  )
  .catch((err) => console.error("QR init error", err));

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
          const idx = Array.from(previewContainer.children).indexOf(wrapper);
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

  if (imageFiles.length === 0) return alert("Ajoutez au moins une photo.");

  const form = new FormData(e.target);
  const record = { _id: new Date().toISOString(), photos: [] };

  form.forEach((val, key) => (record[key] = val));

  // Traitement images (converties en base64)
  for (const file of imageFiles) {
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    record.photos.push(base64);
  }

  try {
    await localDB.put(record);
    alert("Stock enregistré !");
    e.target.reset();
    imageFiles = [];
    document.getElementById("previewContainer").innerHTML = "";
    updatePhotoCount();

  } catch (err) {
    console.error("Erreur sauvegarde :", err);
    alert("Erreur lors de l'enregistrement.");
  }
});
