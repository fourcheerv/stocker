document.addEventListener('DOMContentLoaded', async () => {
  const authDB = new AuthDB();
  
  const defaultPasswords = {
    'SCE Informations Sportives': 'sport2025',
    'SCE Support Rédaction': 'redac2025',
    'Maintenance Machines': 'maintenance2025',
    'Service Rotatives': 'rotatives2025',
    'Service Expédition': 'expedition2025',
    'Direction Vente': 'direction2025',
    'LER Charges': 'ler2025',
    'Service Travaux': 'travaux2025',
    'Achats Magasin': 'achats2025',
    'Manutention Papier': 'manutention2025',
    'Coursiers': 'coursiers2025',
    'Cantine': 'cantine2025',
    'SMI': 'smi2025',
    'Administrateur': 'adminStocker2025!'
  };

  for (const [service, pass] of Object.entries(defaultPasswords)) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(pass, salt);
    
    const userId = service === 'Administrateur' 
      ? 'Admin' 
      : `SCT=${service.replace(/\s+/g, '').substring(0, 6).toUpperCase()}329`;
    
    await authDB.saveUser({
      id: userId,
      service,
      password: hash,
      passwordChanged: false,
      redirect: service === 'Administrateur' ? 'admin.html' : 'index.html'
    });
    
    console.log(`Service ${service} initialisé avec ID: ${userId}`);
  }

  console.log('Tous les comptes ont été initialisés');
});