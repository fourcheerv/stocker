// --- Synchronisation ---
const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:motdepasse@couchdb.monproprecloud.fr/stocks");
localDB.sync(remoteDB, { live: true, retry: true }).on("error", err => console.error("Erreur de sync avec le remoteDB :", err));

// --- Initialisation QR scanner (Html5Qrcode) ---
let qrReader = null;
document.addEventListener('DOMContentLoaded', () => {
    if (window.Html5Qrcode) {
        qrReader = new Html5Qrcode("qr-reader");
        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length) {
                qrReader.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: 250 },
                    (text) => {
                        document.getElementById('codebarre').value = text;
                    },
                    (err) => { /* ignore scan errors */ }
                );
            }
        }).catch(console.warn);
    }
});

// --- Cameras/photo preview (une photo possible) ---
let imageFiles = [];
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
function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.createElement('img');
        preview.src = e.target.result;
        preview.width = 200;
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';
        container.appendChild(preview);
    };
    reader.readAsDataURL(file);
}

// --- Envoi du formulaire (code, photo) ---
document.getElementById('bobinesForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const code = document.getElementById('codebarre').value.trim();
    if (!code) {
        alert("Veuillez scanner ou saisir le code barre !");
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
    // Identifiant de l'utilisateur connecté
    const account = sessionStorage.getItem('currentAccount') || 'BOBINES';
    const record = {
        _id: new Date().toISOString(),
        type: "bobine",
        codebarre: code,
        photos,
        axe1: account
    };
    try {
        await localDB.put(record);
        document.getElementById('success').style.display = 'block';
        document.getElementById('bobinesForm').reset();
        document.getElementById('previewContainer').innerHTML = '';
        imageFiles = [];
    } catch (err) {
        alert("Erreur lors de l'enregistrement.");
        console.error(err);
    }
});

// --- Voir mes enregistrements (ouvrir admin filtré sur le compte) ---
document.getElementById('voirEnregistrementsBtn').addEventListener('click', function() {
    const account = sessionStorage.getItem('currentAccount') || 'BOBINES';
    window.location.href = `admin.html?fromIndex=true&account=${encodeURIComponent(account)}`;
});
