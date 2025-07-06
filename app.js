document.addEventListener("DOMContentLoaded", async function () {
    const form = document.getElementById("stockForm");
    const localDB = new PouchDB("stocks");

    const remoteURL = "https://couchdb.monproprecloud.fr/stocks"; // ⚠️ Mets ton domaine ici
    const loginURL = "https://couchdb.monproprecloud.fr/_session";

    // Authentifie l’utilisateur via session
    const loginRes = await fetch(loginURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "name=admin&password=M,jvcmHSdl54!",
      credentials: "include"
    });

    if (!loginRes.ok) {
      alert("Échec de l'authentification CouchDB.");
      return;
    }

    // Configure la synchro avec cookies
    const remoteDB = new PouchDB(remoteURL, {
      fetch: (url, opts) => {
        opts.credentials = "include";
        return PouchDB.fetch(url, opts);
      }
    });

    localDB.sync(remoteDB, { live: true, retry: true })
      .on("change", info => console.log("Sync change:", info))
      .on("error", err => console.error("Sync error:", err));

    // Scanner de code-barres
    const qrReader = new Html5Qrcode("qr-reader");
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        qrReader.start(
          devices[0].id,
          { fps: 10, qrbox: 250 },
          qrCodeMessage => {
            document.getElementById("code_produit").value = qrCodeMessage;
            qrReader.stop();
          },
          errorMessage => {
            // console.log("Scan error:", errorMessage);
          }
        );
      }
    });

    // Soumission du formulaire
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const formData = new FormData(form);
      const doc = { _id: new Date().toISOString() };

      formData.forEach((value, key) => {
        if (key === "photo" && formData.get("photo").name) {
          doc[key] = {
            name: formData.get("photo").name,
            type: formData.get("photo").type,
            content: "base64-placeholder"
          };
        } else {
          doc[key] = value;
        }
      });

      const file = formData.get("photo");
      if (file && file.name) {
        const reader = new FileReader();
        reader.onload = function () {
          doc["photo"].content = reader.result.split(",")[1];
          localDB.put(doc).then(() => {
            alert("Données enregistrées avec succès !");
            form.reset();
          }).catch(err => {
            console.error(err);
            alert("Erreur d'enregistrement.");
          });
        };
        reader.readAsDataURL(file);
      } else {
        localDB.put(doc).then(() => {
          alert("Données enregistrées avec succès !");
          form.reset();
        }).catch(err => {
          console.error(err);
          alert("Erreur d'enregistrement.");
        });
      }
    });
  });
