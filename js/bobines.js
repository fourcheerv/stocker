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

// Fonction utilitaire pour compresser les images
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

// Mise à jour du compteur de photos
function updatePhotoCount() {
    document.getElementById("photoCount").textContent = imageFiles.length;
}

// Gestion des fichiers photo
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
                removeBtn.addEventListener("click", () => {
                    const idx = Array.from(document.getElementById("previewContainer").children).indexOf(wrapper);
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

// Initialisation du scanner QR
function initQRScanner() {
    if (!window.Html5Qrcode) return;

    Html5Qrcode.getCameras()
        .then((devices) => {
            if (devices && devices.length) {
                qrReader = new Html5Qrcode("qr-reader");
                function isNumeric(str) {
                return /^\d+$/.test(str);
                }
                qrReader.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    (text) => {
                        if (!isSubmitting) {
                            document.getElementById("code_produit").value = text;
                        }
                    },
                    (err) => { /* ignore scan errors */ }
                ).catch((err) => console.warn("QR start error:", err));
            }
        })
        .catch((err) => console.error("Camera access error:", err));
}

// Arrêter le scanner QR
function stopQRScanner() {
    if (qrReader) {
        qrReader.stop().catch((err) => console.error("Failed to stop QR scanner:", err));
    }
}

// Réinitialisation du formulaire
function resetForm() {
    document.getElementById("bobinesForm").reset();
    imageFiles = [];
    document.getElementById("previewContainer").innerHTML = "";
    updatePhotoCount();
    document.getElementById("success").style.display = "none";
    document.getElementById("code_produit").value = "";
    document.getElementById("quantité_consommee").value = "1"; // Réinitialiser à 1
    document.getElementById("remarques").value = "";
    document.getElementById("axe1").value = currentAccount;
}

// Déconnexion
function logout() {
    sessionStorage.removeItem("currentAccount");
    sessionStorage.removeItem("currentServiceName");
    window.location.href = "login.html";
}

// Initialisation au chargement
window.addEventListener("DOMContentLoaded", () => {
    // Vérification de l'authentification
    currentAccount = sessionStorage.getItem("currentAccount");
    if (!currentAccount) {
        window.location.href = "login.html";
        return;
    }

    // Mise à jour de l'interface
    document.getElementById("axe1").value = currentAccount;
    document.getElementById("quantité_consommee").value = "1"; // Valeur par défaut
    document.getElementById("currentUserLabel").textContent = 
        sessionStorage.getItem("currentServiceName") || currentAccount;

    // Configuration du lien admin
    const adminLink = document.getElementById("adminLink");
    adminLink.style.display = "block";
    adminLink.textContent = "📊 Voir mes enregistrements";
    adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;

    // Bouton déconnexion
    document.getElementById("logoutBtn").addEventListener("click", logout);

    // Scanner QR
    initQRScanner();

    // Écouteurs pour les photos
    document.getElementById("takePhotoBtn").addEventListener("click", () => {
        document.getElementById("cameraInput").click();
    });

    document.getElementById("chooseGalleryBtn").addEventListener("click", () => {
        document.getElementById("galleryInput").click();
    });

    document.getElementById("cameraInput").addEventListener("change", (e) => {
        handleFiles(e.target.files);
    });

    document.getElementById("galleryInput").addEventListener("change", (e) => {
        handleFiles(e.target.files);
    });

    // Soumission du formulaire
   document.getElementById("bobinesForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    // 1. Récupérer et valider le code produit (NUMERIQUE uniquement)
    const code = document.getElementById("code_produit").value.trim();
    if (!/^\d+$/.test(code)) {
        alert("Le code produit doit être strictement composé de chiffres !");
        isSubmitting = false;
        initQRScanner();
        return;
    }

    // 2. Vérifier l'authentification
    if (!currentAccount) {
        alert("Veuillez vous authentifier avant de soumettre le formulaire");
        window.location.href = "login.html";
        return;
    }

    // 3. Bloquer la double soumission
    if (isSubmitting) return;
    isSubmitting = true;
    stopQRScanner();

    // 4. Récupérer les autres champs
    const quantite = parseInt(document.getElementById("quantité_consommee").value) || 1;
    const remarques = document.getElementById("remarques").value.trim();
    const axe1 = document.getElementById("axe1").value;

    // 5. Validation
    if (!code || !axe1) {
        alert("Champ code ou identifiant manquant !");
        isSubmitting = false;
        initQRScanner();
        return;
    }

    // 6. Gestion des photos
    let photos = [];
    if (imageFiles.length > 0) {
        for (const file of imageFiles) {
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
            photos.push(base64);
        }
    }

    // 7. Création de l'objet à enregistrer
    const record = {
        _id: new Date().toISOString(),
        type: "bobine",
        code_produit: code,
        quantité_consommee: quantite,
        remarques: remarques,
        axe1: axe1,
        photos: photos
    };

    // 8. Tentative d'enregistrement
    try {
        await localDB.put(record);
        document.getElementById("success").style.display = "block";
        setTimeout(() => {
            document.getElementById("success").style.display = "none";
        }, 3000);
        alert("Stock enregistré !");
        resetForm();
    } catch (err) {
        alert("Erreur lors de l'enregistrement.");
        console.error(err);
    } finally {
        isSubmitting = false;
        initQRScanner();
    }
});


    // Bouton réinitialiser
    document.getElementById("resetBtn").addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("Voulez-vous vraiment réinitialiser le formulaire ?")) {
            resetForm();
        }
    });
});
