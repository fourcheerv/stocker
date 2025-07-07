// Gestion de la connexion
document.getElementById('btn-rotatives').addEventListener('click', () => {
  // Stocker le compte dans sessionStorage
  sessionStorage.setItem('currentAccount', 'SCT=E382329');
  // Rediriger vers la page principale
  window.location.href = 'index.html';
});

document.getElementById('btn-expedition').addEventListener('click', () => {
  // Stocker le compte dans sessionStorage
  sessionStorage.setItem('currentAccount', 'SCT=E390329');
  // Rediriger vers la page principale
  window.location.href = 'index.html';
});

// Animation au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
  const accountButtons = document.querySelectorAll('.account-btn');
  
  // Animation d'apparition des boutons
  setTimeout(() => {
    accountButtons.forEach((btn, index) => {
      setTimeout(() => {
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0)';
      }, 300 * index);
    });
  }, 500);
  
  // Initialiser les styles pour l'animation
  accountButtons.forEach(btn => {
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(20px)';
    btn.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  });
});