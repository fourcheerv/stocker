 document.addEventListener("DOMContentLoaded", function () {
      const form = document.getElementById("stockForm");
      const localDB = new PouchDB('stocks');
      const remoteDB = new PouchDB('https://apikey-v2-237azo7t1nwttyu787vl2zuxfh5ywxrddnfhcujd2nbu:b7ce3f8c0a99a10c0825a4c1ff68fe62@ca3c9329-df98-4982-a3dd-ba2b294b02ef-bluemix.cloudantnosqldb.appdomain.cloud/stocks');

      // Sync local -> remote
      localDB.sync(remoteDB, { live: true, retry: true })
        .on('change', info => console.log('Sync change:', info))
        .on('error', err => console.error('Sync error:', err));

      // Scanner de code-barres (via html5-qrcode)
      const qrReader = new Html5Qrcode("qr-reader");
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
          qrReader.start(
            devices[0].id,
            { fps: 10, qrbox: 250 },
            qrCodeMessage => {
              document.getElementById("Code_Produit").value = qrCodeMessage;
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
          if (key === "Photo" && formData.get("Photo").name) {
            doc[key] = {
              name: formData.get("Photo").name,
              type: formData.get("Photo").type,
              content: "base64-placeholder"
            };
          } else {
            doc[key] = value;
          }
        });

        const file = formData.get("Photo");
        if (file && file.name) {
          const reader = new FileReader();
          reader.onload = function () {
            doc["Photo"].content = reader.result.split(",")[1];
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