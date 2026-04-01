const StockerAuth = (() => {
  const COUCHDB_BASE_URL = "https://couchdb.monproprecloud.fr";
  const AUTH_CACHE_KEY = "stocker-auth-cache-v1";
  const SESSION_KEYS = [
    "currentAccount",
    "currentServiceName",
    "authenticated",
    "authMode",
    "lastAuthAt"
  ];

  function encodePassword(password) {
    return btoa(unescape(encodeURIComponent(password)));
  }

  function decodePassword(encodedPassword) {
    return decodeURIComponent(escape(atob(encodedPassword)));
  }

  function readAuthCache() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || "{}");
    } catch (error) {
      console.warn("Impossible de lire le cache d'authentification local :", error);
      return {};
    }
  }

  function writeAuthCache(cache) {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cache));
  }

  function getCachedCredentials(accountId) {
    const cache = readAuthCache();
    return cache[accountId] || null;
  }

  function cacheCredentials(accountId, serviceName, password) {
    const cache = readAuthCache();
    cache[accountId] = {
      serviceName,
      password: encodePassword(password),
      updatedAt: new Date().toISOString()
    };
    writeAuthCache(cache);
  }

  function matchesCachedCredentials(accountId, password) {
    const cachedCredentials = getCachedCredentials(accountId);
    if (!cachedCredentials || !cachedCredentials.password) return false;

    try {
      return decodePassword(cachedCredentials.password) === password;
    } catch (error) {
      console.warn("Impossible de relire les identifiants locaux :", error);
      return false;
    }
  }

  function persistClientSession(accountId, serviceName, authMode = "online") {
    sessionStorage.setItem("currentAccount", accountId);
    sessionStorage.setItem("currentServiceName", serviceName);
    sessionStorage.setItem("authenticated", "true");
    sessionStorage.setItem("authMode", authMode);
    sessionStorage.setItem("lastAuthAt", new Date().toISOString());
  }

  function clearClientSession() {
    SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.removeItem("postLoginMessage");
  }

  function getCurrentSession() {
    return {
      accountId: sessionStorage.getItem("currentAccount"),
      serviceName: sessionStorage.getItem("currentServiceName"),
      isAuthenticated: sessionStorage.getItem("authenticated") === "true",
      authMode: sessionStorage.getItem("authMode") || "online"
    };
  }

  function isOfflineSession() {
    return getCurrentSession().authMode === "offline";
  }

  async function parseJsonSafely(response) {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn("Réponse JSON CouchDB invalide :", error);
      return null;
    }
  }

  async function loginRemote(accountId, password) {
    try {
      const response = await fetch(`${COUCHDB_BASE_URL}/_session`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body: `name=${encodeURIComponent(accountId)}&password=${encodeURIComponent(password)}`
      });
      const payload = await parseJsonSafely(response);

      if (response.ok && payload && payload.ok) {
        return { success: true };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          reason: "invalid_credentials",
          error: (payload && payload.reason) || "Identifiant ou mot de passe incorrect"
        };
      }

      return {
        success: false,
        reason: "unavailable",
        error: (payload && payload.reason) || "Connexion au serveur impossible"
      };
    } catch (error) {
      console.error("Erreur connexion CouchDB :", error);
      return {
        success: false,
        reason: "unavailable",
        error: "Connexion au serveur impossible"
      };
    }
  }

  async function validateRemoteSession(accountId) {
    try {
      const response = await fetch(`${COUCHDB_BASE_URL}/_session`, {
        method: "GET",
        credentials: "include"
      });
      const session = await parseJsonSafely(response);

      if (response.ok && session && session.userCtx && session.userCtx.name === accountId) {
        return { success: true };
      }

      return { success: false, reason: "invalid_session" };
    } catch (error) {
      console.error("Erreur vérification session :", error);
      return { success: false, reason: "unreachable" };
    }
  }

  async function tryRestoreRemoteSession(accountId = null) {
    const session = getCurrentSession();
    const targetAccountId = accountId || session.accountId;
    if (!targetAccountId) return false;

    const cachedCredentials = getCachedCredentials(targetAccountId);
    if (!cachedCredentials || !cachedCredentials.password) return false;

    try {
      const remoteLogin = await loginRemote(
        targetAccountId,
        decodePassword(cachedCredentials.password)
      );

      if (remoteLogin.success) {
        persistClientSession(
          targetAccountId,
          session.serviceName || cachedCredentials.serviceName || targetAccountId,
          "online"
        );
        return true;
      }
    } catch (error) {
      console.warn("Restauration de session distante impossible :", error);
    }

    return false;
  }

  async function login(account, password) {
    const remoteLogin = await loginRemote(account.id, password);

    if (remoteLogin.success) {
      cacheCredentials(account.id, account.name, password);
      persistClientSession(account.id, account.name, "online");
      return { success: true, mode: "online" };
    }

    if (remoteLogin.reason === "invalid_credentials") {
      clearClientSession();
      return { success: false, error: remoteLogin.error };
    }

    if (matchesCachedCredentials(account.id, password)) {
      persistClientSession(account.id, account.name, "offline");
      return {
        success: true,
        mode: "offline",
        warning: "Connexion hors ligne active. Les données seront synchronisées dès que CouchDB sera de nouveau accessible."
      };
    }

    clearClientSession();
    return {
      success: false,
      error: "CouchDB est indisponible. Une connexion en ligne réussie est nécessaire au moins une fois sur cet appareil avant d'autoriser le mode hors ligne."
    };
  }

  async function ensureAuthenticatedSession(options = {}) {
    const { redirectTo = "login.html" } = options;
    const session = getCurrentSession();

    if (!session.accountId || !session.isAuthenticated) {
      clearClientSession();
      window.location.href = redirectTo;
      return false;
    }

    const validation = await validateRemoteSession(session.accountId);
    if (validation.success) {
      persistClientSession(session.accountId, session.serviceName || session.accountId, "online");
      return true;
    }

    if (validation.reason === "unreachable") {
      persistClientSession(session.accountId, session.serviceName || session.accountId, "offline");
      return true;
    }

    const restored = await tryRestoreRemoteSession(session.accountId);
    if (restored) {
      return true;
    }

    clearClientSession();
    window.location.href = redirectTo;
    return false;
  }

  async function logout(options = {}) {
    const { redirectTo = "login.html" } = options;

    try {
      await fetch(`${COUCHDB_BASE_URL}/_session`, {
        method: "DELETE",
        credentials: "include"
      });
    } catch (error) {
      console.error("Erreur de déconnexion CouchDB :", error);
    } finally {
      clearClientSession();
      window.location.href = redirectTo;
    }
  }

  return {
    COUCHDB_BASE_URL,
    clearClientSession,
    ensureAuthenticatedSession,
    getCachedCredentials,
    getCurrentSession,
    isOfflineSession,
    login,
    logout,
    persistClientSession,
    tryRestoreRemoteSession
  };
})();

window.StockerAuth = StockerAuth;
