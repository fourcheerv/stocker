let qrReader = null;
let isSubmitting = false;
let imageFiles = [];
let currentAccount = null;

const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:motdepasse@couchdb.monproprecloud.fr/stocks");
localDB.sync(remoteDB, { live: true, retry: true }).on("error", console.error);

window.addEventListener("DOMContentLoaded", () => {
    currentAccount = sessionStorage.getItem('currentAccount');
    if (!currentAccount) {
        window.location.href = 'login.html';
        return;
    }
    updateUIForUserRole();
    initQRScanner();
    setupPhotoInput();
    document.getElementById('axe1').value = currentAccount;

    // Déconnexion
    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('currentAccount');
        sessionStorage.removeItem('currentServiceName');
        window.location.href = 'login.html';
    });

    // Form submit
    document.getElementById('bobinesForm').addEventListener('submit', submitBobine);
    document.getElementById('resetBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm("Voulez-vous vraiment réinitialiser le formulaire ?")) resetForm();
    });
});

function updateUIForUserRole() {
    document.getElementById('currentUserLabel').textContent = sessionStorage.getItem('currentServiceName') || currentAccount;
    const adminLink = document.getElementById('adminLink');
    adminLink.style.display = 'block';
    adminLink.textContent = '📊 Voir mes enregistrements';
    adminLink.href = `admin.html?fromIndex=true&account=${encodeURIComponent(currentAccount)}`;
}

// QRCode
function initQRScanner() {
    if (!window.Html5Qrcode) return;
    qrReader = new Html5Qrcode("qr-reader");
    Html5Qrcode.getCameras().then((devices) => {
        if (devices && devices.length) {
            qrReader.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 200, height: 200 } },
                (text) => {
                    if (!isSubmitting) {
                        document.getElementById('code_produit').value = text;
                    }
                },
                (err) => {}
            ).catch(console.warn);
        }
    });
}

// Photos (1 seule ici pour simplifier)
function setupPhotoInput() {
    document.getElementById('takePhotoBtn').addEventListener('click', ()=>{
        document.getElementById('cameraInput').click();
    });
    document.getElementById('cameraInput').addEventListener('change', (e)=>{
        const file = e.target.files[0];
        if (file && file.type.startsWith("image/")) {
            imageFiles = [file];
            showPreview(file);
        }
    });
}
function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.createElement('img');
        preview.src = e.target.result;
        preview.width = 180;
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';
        container.appendChild(preview);
    };
    reader.readAsDataURL(file);
}

// Formulaire
async function submitBobine(e) {
    e.preventDefault();
    isSubmitting = true;
    const code = document.getElementById('code_produit').value.trim();
    const axe1 = document.getElementById('axe1').value;
    if (!code || !axe1) {
        alert("Champ code ou identifiant manquant !");
        isSubmitting = false;
        return;
    }
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
    const record = {
        _id: new Date().toISOString(),
        type: "bobine",
        code_produit: code,
        axe1: axe1,
        photos: photos
    };
    try {
        await localDB.put(record);
        document.getElementById('success').style.display = 'block';
        resetForm();
    } catch (err) {
        alert("Erreur lors de l'enregistrement.");
        console.error(err);
    }
    isSubmitting = false;
}
function resetForm() {
    document.getElementById('bobinesForm').reset();
    document.getElementById('previewContainer').innerHTML = '';
    document.getElementById('success').style.display = 'none';
    imageFiles = [];
}
