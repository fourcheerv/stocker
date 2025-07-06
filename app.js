let excelData = [];
let selectedPhotos = [];

// Chargement automatique du fichier Excel
window.addEventListener("DOMContentLoaded", () => {
  fetch("stocker_temp.xlsx")
    .then(response => response.arrayBuffer())
    .then(data => {
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      excelData = XLSX.utils.sheet_to_json(sheet);
      const list = document.getElementById("designationList");
      excelData.forEach(row => {
        if (row["Désignation:"]) {
          const option = document.createElement("option");
          option.value = row["Désignation:"];
          list.appendChild(option);
        }
      });
    })
    .catch(error => console.error("Erreur chargement Excel :", error));
});

// Auto-remplissage à partir de la désignation
document.getElementById("designation").addEventListener("change", () => {
  const input = document.getElementById("designation").value.trim().toLowerCase();
  const match = excelData.find(row =>
    (row["Désignation:"] || "").toLowerCase() === input
  );

  if (!match) return;

  const map = {
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

  for (const [excelKey, inputId] of Object.entries(map)) {
    const el = document.getElementById(inputId);
    if (el && match[excelKey] !== undefined) {
      el.value = match[excelKey];
    }
  }
});

// QR Code Scanner
const qrReader = new Html5Qrcode("qr-reader");
qrReader.start(
  { facingMode: "environment" },
  {
    fps: 10,
    qrbox: { width: 250, height: 250 }
  },
  (decodedText) => {
    document.getElementById("code_produit").value = decodedText;
  },
  (err) => {
    console.warn("QR Code scan error", err);
  }
).catch(err => console.error("Erreur démarrage scanner", err));

// Photo : Prendre une photo
document.getElementById("takePhotoBtn").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment";
  input.click();
  input.onchange = () => handlePhotoUpload(input.files[0]);
});

// Photo : Choisir depuis la galerie
document.getElementById("chooseGalleryBtn").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.click();
  input.onchange = () => handlePhotoUpload(input.files[0]);
});

function handlePhotoUpload(file) {
  if (!file || selectedPhotos.length >= 3) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    selectedPhotos.push(e.target.result);
    updatePreview();
  };
  reader.readAsDataURL(file);
}

function updatePreview() {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";
  selectedPhotos.forEach((src, index) => {
    const img = document.createElement("img");
    img.src = src;
    img.className = "preview";
    container.appendChild(img);
  });
  document.getElementById("photoCount").innerText = selectedPhotos.length;
}
