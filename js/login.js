document.addEventListener('DOMContentLoaded', async () => {
  // Vérification des dépendances
  if (typeof authDB === 'undefined' || authDB === null) {
    showError('Erreur système. Veuillez recharger la page.');
    return;
  }

  if (typeof bcrypt === 'undefined') {
    showError('Erreur de sécurité. Veuillez recharger la page.');
    return;
  }

  try {
    await authDB.initializeDefaultAccounts();
  } catch (error) {
    showError('Erreur initialisation. Veuillez recharger la page.');
    return;
  }

  // Éléments du DOM
  const uiElements = {
    passwordSection: document.getElementById('passwordSection'),
    passwordInput: document.getElementById('passwordInput'),
    loginBtn: document.getElementById('loginBtn'),
    errorMsg: document.getElementById('errorMsg'),
    selectedServiceTitle: document.getElementById('selectedServiceTitle')
  };
  
  let selectedService = null;

  // Initialisation UI
  initButtonAnimations();
  setupEventListeners(uiElements);

  // Fonctions internes
  function showError(message) {
    console.error(message);
    if (uiElements.errorMsg) {
      uiElements.errorMsg.textContent = message;
    } else {
      alert(message);
    }
  }

  function initButtonAnimations() {
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
  }

  function setupEventListeners({ passwordSection, passwordInput, loginBtn, errorMsg, selectedServiceTitle }) {
    // Gestion de la sélection du service
    document.querySelectorAll('.account-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const serviceName = btn.dataset.service;
          selectedService = await authDB.getUserByService(serviceName);
          
          if (selectedService) {
            selectedServiceTitle.textContent = selectedService.service;
            passwordSection.style.display = 'block';
            passwordInput.value = '';
            passwordInput.focus();
            errorMsg.textContent = '';
          }
        } catch (error) {
          showError('Erreur de sélection du service');
        }
      });
    });

    // Connexion
    loginBtn.addEventListener('click', handleLogin);

    // Touche Entrée
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleLogin();
      }
    });
  }

  async function handleLogin() {
    try {
      if (!selectedService) {
        showError("Veuillez sélectionner un service");
        return;
      }
      
      const passwordMatch = bcrypt.compareSync(uiElements.passwordInput.value, selectedService.password);
      
      if (passwordMatch) {
        if (!selectedService.passwordChanged) {
          showPasswordChangeForm();
        } else {
          proceedToLogin();
        }
      } else {
        showError("Mot de passe incorrect");
      }
    } catch (error) {
      showError('Erreur de connexion');
    }
  }

  async function showPasswordChangeForm() {
    try {
      uiElements.passwordSection.style.display = 'none';
      
      const changePasswordHTML = `
        <div id="changePasswordSection" class="password-section">
          <h3>Première connexion - Changer votre mot de passe</h3>
          <p>Vous devez changer le mot de passe par défaut</p>
          <input type="password" id="newPasswordInput" placeholder="Nouveau mot de passe" class="password-input">
          <input type="password" id="confirmPasswordInput" placeholder="Confirmer le nouveau mot de passe" class="password-input">
          <button id="changePasswordBtn" class="login-btn">Changer le mot de passe</button>
          <p id="changePasswordError" class="error-message"></p>
        </div>
      `;
      
      uiElements.passwordSection.insertAdjacentHTML('afterend', changePasswordHTML);
      
      document.getElementById('changePasswordBtn').addEventListener('click', handlePasswordChange);
    } catch (error) {
      showError('Erreur d\'affichage du formulaire');
    }
  }

  async function handlePasswordChange() {
    const newPassword = document.getElementById('newPasswordInput')?.value;
    const confirmPassword = document.getElementById('confirmPasswordInput')?.value;
    const errorElement = document.getElementById('changePasswordError');
    
    try {
      if (!newPassword || !confirmPassword) {
        throw new Error('Champs manquants');
      }
      
      if (newPassword !== confirmPassword) {
        errorElement.textContent = "Les mots de passe ne correspondent pas";
        return;
      }
      
      if (newPassword.length < 8) {
        errorElement.textContent = "Le mot de passe doit contenir au moins 8 caractères";
        return;
      }
      
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(newPassword, salt);
      
      selectedService.password = hashedPassword;
      selectedService.passwordChanged = true;
      
      await authDB.saveUser(selectedService);
      
      document.getElementById('changePasswordSection').remove();
      uiElements.passwordSection.style.display = 'block';
      proceedToLogin();
    } catch (error) {
      errorElement.textContent = "Erreur lors du changement de mot de passe";
    }
  }

  function proceedToLogin() {
    try {
      sessionStorage.setItem('currentAccount', selectedService.id);
      sessionStorage.setItem('currentServiceName', selectedService.service);
      window.location.href = selectedService.redirect;
    } catch (error) {
      showError('Erreur de redirection');
    }
  }
});