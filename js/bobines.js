// Configuration PouchDB
const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://admin:motdepasse@couchdb.monproprecloud.fr/stocks");

// Synchronisation live et auto
localDB.sync(remoteDB, { live: true, retry: true })
    .on("error", err => console.error("Erreur de sync avec le remoteDB :", err));

let imageFiles = [];

// Gestion photo
document.getElementById('takePhotoBtn').addEventListener('click', ()=>{
    document.getElementById('cameraInput').click();
});

document.getElementById('cameraInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if (file && file.type.startsWith("image/")) {
        imageFiles = [file]; // Pour ne retenir qu'une seule photo, sinon push dans le tableau
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

// Gestion formulaire
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
    
    const record = {
        _id: new Date().toISOString(),
        type: "bobine",
        codebarre: code,
        photos: photos
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
