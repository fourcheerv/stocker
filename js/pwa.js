(function () {
  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function injectBannerStyles() {
    if (document.getElementById("pwa-install-style")) return;

    const style = document.createElement("style");
    style.id = "pwa-install-style";
    style.textContent = `
      .pwa-install-banner {
        position: fixed;
        left: 16px;
        right: 16px;
        bottom: 16px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(12, 129, 180, 0.96);
        color: #fff;
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.22);
      }
      .pwa-install-banner[hidden] {
        display: none;
      }
      .pwa-install-copy {
        flex: 1;
        min-width: 0;
      }
      .pwa-install-title {
        margin: 0 0 4px;
        font-size: 0.98rem;
        font-weight: 700;
      }
      .pwa-install-text {
        margin: 0;
        font-size: 0.88rem;
        line-height: 1.35;
        opacity: 0.95;
      }
      .pwa-install-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .pwa-install-action {
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer;
      }
      .pwa-install-primary {
        background: #fff;
        color: #0c81b4;
      }
      .pwa-install-secondary {
        background: transparent;
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.55);
      }
      @media (max-width: 640px) {
        .pwa-install-banner {
          flex-direction: column;
          align-items: stretch;
        }
        .pwa-install-actions {
          width: 100%;
        }
        .pwa-install-action {
          flex: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createBanner() {
    if (document.getElementById("pwaInstallBanner") || isStandalone()) return null;

    injectBannerStyles();

    const banner = document.createElement("section");
    banner.id = "pwaInstallBanner";
    banner.className = "pwa-install-banner";
    banner.hidden = true;
    banner.innerHTML = `
      <div class="pwa-install-copy">
        <p class="pwa-install-title">Installer Stocker sur Android</p>
        <p class="pwa-install-text">Acces rapide, interface plein ecran et meilleure experience mobile.</p>
      </div>
      <div class="pwa-install-actions">
        <button type="button" class="pwa-install-action pwa-install-primary" id="pwaInstallBtn">Installer</button>
        <button type="button" class="pwa-install-action pwa-install-secondary" id="pwaDismissBtn">Plus tard</button>
      </div>
    `;

    document.body.appendChild(banner);

    banner.querySelector("#pwaDismissBtn").addEventListener("click", function () {
      sessionStorage.setItem("pwa-install-dismissed", "true");
      banner.hidden = true;
    });

    banner.querySelector("#pwaInstallBtn").addEventListener("click", async function () {
      if (!deferredInstallPrompt) {
        alert("Sur Android, vous pouvez aussi utiliser le menu du navigateur puis 'Installer l'application' ou 'Ajouter a l'ecran d'accueil'.");
        return;
      }

      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome !== "accepted") {
        banner.hidden = false;
      }
      deferredInstallPrompt = null;
    });

    return banner;
  }

  function updateBannerVisibility() {
    const banner = document.getElementById("pwaInstallBanner") || createBanner();
    if (!banner || isStandalone()) return;

    const dismissed = sessionStorage.getItem("pwa-install-dismissed") === "true";
    banner.hidden = dismissed || !deferredInstallPrompt;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/stocker/js/service-worker.js").catch(function (error) {
        console.error("Echec de l'enregistrement du Service Worker:", error);
      });
    });
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    sessionStorage.removeItem("pwa-install-dismissed");
    updateBannerVisibility();
  });

  window.addEventListener("appinstalled", function () {
    deferredInstallPrompt = null;
    const banner = document.getElementById("pwaInstallBanner");
    if (banner) banner.hidden = true;
  });

  window.StockerPWA = {
    updateBannerVisibility,
    isStandalone
  };

  registerServiceWorker();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateBannerVisibility, { once: true });
  } else {
    updateBannerVisibility();
  }
})();
