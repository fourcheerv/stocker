// Configuration des comptes (SANS mots de passe)
const serviceAccounts = {
  'btn-bobines': {
    id: 'BOB329',
    name: 'Bobines',
    redirect: 'bobines.html'
  },
  'btn-info-sport': {
    id: 'SCT=E260329',
    name: 'SCE Informations Sportives',
    redirect: 'index.html'
  },
  'btn-support-redac': {
    id: 'SCT=E272329',
    name: 'SCE Support Rédaction',
    redirect: 'index.html'
  },
  'btn-maintenance': {
    id: 'SCT=E370329',
    name: 'Maintenance Machines',
    redirect: 'index.html'
  },
  'btn-rotatives': {
    id: 'SCT=E382329',
    name: 'Service Rotatives',
    redirect: 'index.html'
  },
  'btn-expedition': {
    id: 'SCT=E390329',
    name: 'Service Expédition',
    redirect: 'index.html'
  },
  'btn-direction': {
    id: 'SCT=E500329',
    name: 'Direction Vente',
    redirect: 'index.html'
  },
  'btn-ler': {
    id: 'SCT=E730329',
    name: 'LER Charges',
    redirect: 'index.html'
  },
  'btn-travaux': {
    id: 'SCT=E736329',
    name: 'Service Travaux',
    redirect: 'index.html'
  },
  'btn-achats': {
    id: 'SCT=E760329',
    name: 'Achats Magasin',
    redirect: 'index.html'
  },
  'btn-manutention': {
    id: 'SCT=E762329',
    name: 'Manutention Papier',
    redirect: 'index.html'
  },
  'btn-coursiers': {
    id: 'SCT=E772329',
    name: 'Coursiers',
    redirect: 'index.html'
  },
  'btn-cantine': {
    id: 'SCT=E860329',
    name: 'Cantine',
    redirect: 'index.html'
  },
  'btn-smi': {
    id: 'SCT=E359329',
    name: 'SMI',
    redirect: 'index.html'
  },
  'btn-admin': {
    id: 'Admin',
    name: 'Administrateur',
    redirect: 'admin.html'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const passwordSection = document.getElementById('passwordSection');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');
  const selectedServiceTitle = document.getElementById('selectedServiceTitle');
  
  let selectedService = null;

  // Animation des boutons
  const accountButtons = document.querySelectorAll('.account-btn');
  setTimeout(() => {
    accountButtons.forEach((btn, index) => {
      setTimeout(() => {
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0)';
      }, 100 * index);
    });
  }, 500);
  
  accountButtons.forEach(btn => {
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(20px)';
    btn.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  });

  // Gestion de la sélection du service
  accountButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const serviceId = btn.id;
      if (serviceAccounts[serviceId]) {
        selectedService = serviceAccounts[serviceId];
        selectedServiceTitle.textContent = selectedService.name;
        usernameInput.value = selectedService.id;
        passwordSection.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
        errorMsg.textContent = '';
      }
    });
  });

  // Authentification CouchDB via /_session
  async function loginCouchDB(username, password) {
    try {
      const response = await fetch("https://couchdb.monproprecloud.fr/_session", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `name=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        credentials: "include"
      });
      
      if (response.ok) {
        return { success: true };
      } else {
        const data = await response.json();
        return { success: false, error: data.reason || "Authentification échouée" };
      }
    } catch (error) {
      console.error("Erreur connexion CouchDB:", error);
      return { success: false, error: "Erreur de connexion au serveur" };
    }
  }

  // Gestion de la connexion
  loginBtn.addEventListener('click', async () => {
    if (!selectedService) {
      errorMsg.textContent = "Veuillez sélectionner un service";
      return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!password) {
      errorMsg.textContent = "Veuillez entrer votre mot de passe";
      return;
    }
    
    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion...";
    errorMsg.textContent = "";
    
    // Authentification CouchDB
    const result = await loginCouchDB(username, password);
    
    if (result.success) {
      sessionStorage.setItem('currentAccount', selectedService.id);
      sessionStorage.setItem('currentServiceName', selectedService.name);
      sessionStorage.setItem('authenticated', 'true');
      window.location.href = selectedService.redirect;
    } else {
      errorMsg.textContent = result.error || "Identifiant ou mot de passe incorrect";
      loginBtn.disabled = false;
      loginBtn.textContent = "Se connecter";
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  // Entrée pour valider
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginBtn.click();
    }
  });
});
