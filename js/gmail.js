const GMAIL_CLIENT_ID = '283743756981-c3dp88fodaudspddumurobveupvhll7e.apps.googleusercontent.com';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const PURCHASE_EMAIL_TO = 'ervachats@ervmedia.fr';

function toBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}

function chunkSplit(str, length) {
  return (str.match(new RegExp(`.{1,${length}}`, 'g')) || []).join("\r\n");
}

function loadGAPI() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts) {
      resolve();
      return;
    }

    const existingScript = document.querySelector('script[data-google-gsi="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error("Échec du chargement de l'API Google Identity Services")), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';

    script.onload = () => {
      if (window.google && window.google.accounts) {
        resolve();
      } else {
        reject(new Error("L'API Google n'est pas disponible après chargement"));
      }
    };

    script.onerror = () => {
      reject(new Error("Échec du chargement de l'API Google Identity Services"));
    };

    document.body.appendChild(script);
  });
}

function generateStockCsvContent(docs) {
  const headers = ["Code Produit", "Quantité Consommée", "Axe 1", "Axe 2"];
  let csvContent = "\uFEFF";
  csvContent += headers.join(";") + "\r\n";

  docs.forEach((doc) => {
    const row = [
      doc.code_produit || doc.codeproduit || '',
      doc.quantité_consommee ?? doc.quantite_consommee ?? '',
      doc.axe1 || '',
      doc.axe2 || ''
    ].map((field) => {
      const safeField = String(field).replace(/"/g, '""');
      return safeField.includes(';') ? `"${safeField}"` : safeField;
    });

    csvContent += row.join(";") + "\r\n";
  });

  return csvContent;
}

async function sendDocsToPurchasingEmail({
  docs,
  filename,
  subject,
  bodyText,
  to = PURCHASE_EMAIL_TO
}) {
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new Error("Aucune donnée à exporter");
  }

  await loadGAPI();

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GMAIL_CLIENT_ID,
      scope: GMAIL_SEND_SCOPE,
      callback: async (tokenResponse) => {
        try {
          if (tokenResponse.error) throw new Error(tokenResponse.error);

          const csvContent = generateStockCsvContent(docs);
          const boundary = "----boundary_" + Math.random().toString(16).slice(2);
          const nl = "\r\n";

          const mimeParts = [
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
            '',
            bodyText,
            '',
            `--${boundary}`,
            'Content-Type: text/csv; charset=UTF-8',
            `Content-Disposition: attachment; filename="${filename}"`,
            'Content-Transfer-Encoding: base64',
            '',
            chunkSplit(toBase64(csvContent), 76),
            ''
          ];

          let photoIndex = 1;
          for (const doc of docs) {
            if (!Array.isArray(doc.photos)) continue;

            for (const photo of doc.photos) {
              if (!photo) continue;

              const base64Data = photo.startsWith('data:image') ? photo.split(',')[1] : photo;
              const imageExt = photo.includes('jpeg') || photo.includes('jpg') ? 'jpg' : 'png';
              const photoFilename = `photo_${photoIndex}.${imageExt}`;

              mimeParts.push(`--${boundary}`);
              mimeParts.push(`Content-Type: image/${imageExt}`);
              mimeParts.push(`Content-Disposition: attachment; filename="${photoFilename}"`);
              mimeParts.push('Content-Transfer-Encoding: base64');
              mimeParts.push('');
              mimeParts.push(chunkSplit(base64Data, 76));
              mimeParts.push('');
              photoIndex += 1;
            }
          }

          mimeParts.push(`--${boundary}--`);

          const rawMessage = [
            `To: ${to}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            '',
            ...mimeParts
          ].join(nl);

          const encodedMessage = toBase64(rawMessage)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenResponse.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedMessage })
          });

          if (!response.ok) {
            throw new Error(await response.text());
          }

          resolve();
        } catch (error) {
          reject(error);
        }
      },
      error_callback: (error) => {
        reject(new Error(error?.message || "Erreur d'authentification Google"));
      }
    });

    client.requestAccessToken();
  });
}
