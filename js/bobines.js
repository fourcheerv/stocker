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

// Compression d'image
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

// Gestion photos
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
                removeBtn.textContent = "×";
                removeBtn.onclick = () => {
                    const idx = [...document.getElementById("previewContainer").children].indexOf(wrapper);
                    if (idx !== -1) {
                        imageFiles.splice(idx, 1);
                        wrapper.remove();
                        updatePhotoCount();
                    }
                };
                wrapper.appendChild(img);
                wrapper.appendChild(removeBtn);
                document.getElementById("previewContainer").appendChild(wrapper);
                updatePhotoCount();
            };
            reader.readAsDataURL(blob);
        });
    });
}

// Scanner QR
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
                        } else if (!isSubmitting && text) {
                            alert("Le code scanné doit être uniquement numérique.");
                        }
                    },
                    (err) => {}
                ).catch((err) => console.warn("QR start error:", err));
            }
        })
        .catch((err) => console.error("Camera access error:", err));
}

function stopQRScanner() {
    if (qrReader) {
        qrReader.stop().catch(console.warn);
    }
}

// Réinitialisation du formulaire
function resetForm() {
    document.getElementById("bobinesForm").reset();
    imageFiles = [];
    document.getElementById("previewContainer").innerHTML = "";
    updatePhotoCount();
    document.getElementById("quantité_consommee").value = "1";
}

function logout() {
    sessionStorage.clear();
    window.location.href = "login.html";
}

// Initialisation de la page
window.addEventListener("DOMContentLoaded", () => {
    // Authentification
    currentAccount = sessionStorage.getItem("currentAccount");
    if (!currentAccount) {
        window.location.href = "login.html";
        return;
    }

   
    document.getElementById("axe1").value = currentAccount;
    document.getElementById("quantité_consommee").value = "1";
    document.getElementById("currentUserLabel").textContent =
        sessionStorage.getItem("currentServiceName") || currentAccount;

    // Lien admin
    const adminLink = document.getElementById("adminLink");
    adminLink.style.display = "block";
    adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;

    // Logout
    document.getElementById("logoutBtn").addEventListener("click", logout);

    // Scanner
    initQRScanner();

    // Photos
    document.getElementById("takePhotoBtn").onclick = () => document.getElementById("cameraInput").click();
    document.getElementById("chooseGalleryBtn").onclick = () => document.getElementById("galleryInput").click();
    document.getElementById("cameraInput").onchange = (e) => handleFiles(e.target.files);
    document.getElementById("galleryInput").onchange = (e) => handleFiles(e.target.files);

    // Soumission du formulaire
    document.getElementById("bobinesForm").onsubmit = async (e) => {
        e.preventDefault();

        const code = document.getElementById("code_produit").value.trim();
        if (!/^\d+$/.test(code)) {
            alert("Le code produit doit être strictement composé de chiffres !");
            isSubmitting = false;
            initQRScanner();
            return;
        }

        const quantité_consommee = parseInt(document.getElementById("quantité_consommee").value) || 1;
        const remarques = document.getElementById("remarques").value.trim();
        const axe1 = currentAccount;

        const record = {
            _id: new Date().toISOString(),
            type: "bobine",
            code_produit: code,
            quantité_consommee: quantité_consommee,
            remarques,
            axe1,
            photos: []
        };

        try {
            await localDB.put(record);
            alert("Stock enregistré !");
            resetForm();
        } catch (err) {
            alert("Erreur lors de l'enregistrement.");
            console.error(err);
        } finally {
            isSubmitting = false;
            initQRScanner();
        }
    };
});
