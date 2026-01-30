// Configuration des comptes avec mots de passe
const serviceAccounts = {

  'btn-bobines': {
        id: 'BOB329',
        password: 'bobines2025',
        name: 'Bobines',
        redirect: 'bobines.html'
    },

  'btn-info-sport': {
    id: 'SCT=E260329',
    password: 'sport2025',
    name: 'SCE Informations Sportives',
    redirect: 'index.html'
  },
  'btn-support-redac': {
    id: 'SCT=E272329',
    password: 'redac2025',
    name: 'SCE Support Rédaction',
    redirect: 'index.html'
  },
  'btn-maintenance': {
    id: 'SCT=E370329',
    password: 'maintenance2025',
    name: 'Maintenance Machines',
    redirect: 'index.html'
  },
  'btn-rotatives': {
    id: 'SCT=E382329',
    password: 'rotatives2025',
    name: 'Service Rotatives',
    redirect: 'index.html'
  },
  'btn-expedition': {
    id: 'SCT=E390329',
    password: 'expedition2025',
    name: 'Service Expédition',
    redirect: 'index.html'
  },
  'btn-direction': {
    id: 'SCT=E500329',
    password: 'direction2025',
    name: 'Direction Vente',
    redirect: 'index.html'
  },
  'btn-ler': {
    id: 'SCT=E730329',
    password: 'ler2025',
    name: 'LER Charges',
    redirect: 'index.html'
  },
  'btn-travaux': {
    id: 'SCT=E736329',
    password: 'travaux2025',
    name: 'Service Travaux',
    redirect: 'index.html'
  },
  'btn-achats': {
    id: 'SCT=E760329',
    password: 'achats2025',
    name: 'Achats Magasin',
    redirect: 'index.html'
  },
  'btn-manutention': {
    id: 'SCT=E762329',
    password: 'manutention2025',
    name: 'Manutention Papier',
    redirect: 'index.html'
  },
  'btn-coursiers': {
    id: 'SCT=E772329',
    password: 'coursiers2025',
    name: 'Coursiers',
    redirect: 'index.html'
  },
  'btn-cantine': {
    id: 'SCT=E860329',
    password: 'cantine2025',
    name: 'Cantine',
    redirect: 'index.html'
  },
  'btn-smi': {
    id: 'SCT=E359329',
    password: 'smi2025',
    name: 'SMI',
    redirect: 'index.html'
  },
  'btn-admin': {
    id: 'Admin',
    password: 'adminStocker2025!',
    name: 'Administrateur',
    redirect: 'admin.html'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const passwordSection = document.getElementById('passwordSection');
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
        passwordSection.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
        errorMsg.textContent = '';
      }
    });
  });

  // Gestion de la connexion
  loginBtn.addEventListener('click', () => {
    if (!selectedService) {
      errorMsg.textContent = "Veuillez sélectionner un service";
      return;
    }
    
    if (passwordInput.value === selectedService.password) {
      sessionStorage.setItem('currentAccount', selectedService.id);
      sessionStorage.setItem('currentServiceName', selectedService.name);
      window.location.href = selectedService.redirect;
    } else {
      errorMsg.textContent = "Mot de passe incorrect";
    }
  });

  // Entrée pour valider
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginBtn.click();
    }
  });
});

 const passwordInput = document.getElementById("passwordInput");
  const togglePassword = document.getElementById("togglePassword");


document.addEventListener("click", function (e) {
  if (e.target.id === "togglePassword") {
    const passwordInput = document.getElementById("passwordInput");

    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      e.target.textContent = "🙈";
    } else {
      passwordInput.type = "password";
      e.target.textContent = "👁️";
    }
  }
});

