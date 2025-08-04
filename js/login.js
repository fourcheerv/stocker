document.addEventListener('DOMContentLoaded', async () => {
  await authDB.initializeDefaultAccounts();
  
  // Éléments du DOM
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
    btn.addEventListener('click', async () => {
      const serviceName = btn.dataset.service;
      selectedService = await authDB.getUserByService(serviceName);
      
      if (selectedService) {
        selectedServiceTitle.textContent = selectedService.service;
        passwordSection.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
        errorMsg.textContent = '';
      }
    });
  });

  // Connexion
  loginBtn.addEventListener('click', async () => {
    if (!selectedService) {
      errorMsg.textContent = "Veuillez sélectionner un service";
      return;
    }
    
    const passwordMatch = bcrypt.compareSync(passwordInput.value, selectedService.password);
    
    if (passwordMatch) {
      if (!selectedService.passwordChanged) {
        showPasswordChangeForm();
      } else {
        proceedToLogin();
      }
    } else {
      errorMsg.textContent = "Mot de passe incorrect";
    }
  });

  async function showPasswordChangeForm() {
    passwordSection.style.display = 'none';
    
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
    
    passwordSection.insertAdjacentHTML('afterend', changePasswordHTML);
    
    document.getElementById('changePasswordBtn').addEventListener('click', handlePasswordChange);
  }

  async function handlePasswordChange() {
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;
    const errorElement = document.getElementById('changePasswordError');
    
    if (newPassword !== confirmPassword) {
      errorElement.textContent = "Les mots de passe ne correspondent pas";
      return;
    }
    
    if (newPassword.length < 8) {
      errorElement.textContent = "Le mot de passe doit contenir au moins 8 caractères";
      return;
    }
    
    // Hacher le nouveau mot de passe
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);
    
    // Mettre à jour l'utilisateur
    selectedService.password = hashedPassword;
    selectedService.passwordChanged = true;
    
    await authDB.saveUser(selectedService);
    
    // Procéder à la connexion
    document.getElementById('changePasswordSection').remove();
    passwordSection.style.display = 'block';
    proceedToLogin();
  }

  function proceedToLogin() {
    sessionStorage.setItem('currentAccount', selectedService.id);
    sessionStorage.setItem('currentServiceName', selectedService.service);
    window.location.href = selectedService.redirect;
  }

  // Gestion de la touche Entrée
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginBtn.click();
    }
  });
});