// Vérification que idb est bien chargé
if (typeof idb === 'undefined') {
  console.error('Erreur: La bibliothèque idb n\'est pas chargée correctement');
  throw new Error('La bibliothèque IndexedDB (idb) est requise');
}

class AuthDB {
  constructor() {
    try {
      this.dbPromise = this.initDB();
    } catch (error) {
      console.error('Erreur initialisation DB:', error);
      throw new Error('Impossible d\'initialiser la base de données');
    }
  }

  initDB() {
    return idb.open('AuthDatabase', 1, upgradeDB => {
      try {
        if (!upgradeDB.objectStoreNames.contains('users')) {
          const store = upgradeDB.createObjectStore('users', { keyPath: 'id' });
          store.createIndex('by_service', 'service', { unique: true });
        }
      } catch (error) {
        console.error('Erreur création store:', error);
        throw error;
      }
    });
  }

  async saveUser(user) {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction('users', 'readwrite');
      await tx.objectStore('users').put(user);
      await tx.complete;
      return user;
    } catch (error) {
      console.error('Erreur sauvegarde utilisateur:', error);
      throw error;
    }
  }

  async getUserById(id) {
    try {
      const db = await this.dbPromise;
      return await db.transaction('users').objectStore('users').get(id);
    } catch (error) {
      console.error('Erreur récupération utilisateur:', error);
      throw error;
    }
  }

  async getUserByService(service) {
    try {
      const db = await this.dbPromise;
      return await db.transaction('users')
        .objectStore('users')
        .index('by_service')
        .get(service);
    } catch (error) {
      console.error('Erreur récupération par service:', error);
      throw error;
    }
  }

  async initializeDefaultAccounts() {
    const defaultAccounts =  [
      {
        id: 'SCT=E260329',
        service: 'SCE Informations Sportives',
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrq4H3d5E5Z7yT7JYFJQY8tCq1QxW6O',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E272329',
        service: 'SCE Support Rédaction',
        password: '$2a$10$8A2z6bXeJk7QYJZwjZJQwO.9w9j9t0J9z0J9z0J9z0J9z0J9z0J9z',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E370329',
        service: 'Maintenance Machines',
        password: '$2a$10$V7m9z6bXeJk7QYJZwjZJQwO.9w9j9t0J9z0J9z0J9z0J9z0J9z0J9',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E382329',
        service: 'Service Rotatives',
        password: '$2a$10$X8n9z6bXeJk7QYJZwjZJQwO.9w9j9t0J9z0J9z0J9z0J9z0J9z0J',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E390329',
        service: 'Service Expédition',
        password: '$2a$10$Y9o8uLOickgx2ZMRZoMy.Mrq4H3d5E5Z7yT7JYFJQY8tCq1QxW6O',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E500329',
        service: 'Direction Vente',
        password: '$2a$10$Z1p2r3t4y5u6i7o8p9q0w1e2r3t4y5u6i7o8p9q0w1e2r3t4y5u6i',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E730329',
        service: 'LER Charges',
        password: '$2a$10$A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E736329',
        service: 'Service Travaux',
        password: '$2a$10$Q1W2E3R4T5Y6U7I8O9P0A1S2D3F4G5H6J7K8L9Z0X1C2V3B4N5M6',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E760329',
        service: 'Achats Magasin',
        password: '$2a$10$L1K2J3H4G5F6D7S8A9Q0W1E2R3T4Y5U6I7O8P9Z0X1C2V3B4N5M6',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E762329',
        service: 'Manutention Papier',
        password: '$2a$10$M1N2B3V4C5X6Z7L8K9J0H1G2F3D4S5A6Q7W8E9R0T1Y2U3I4O5P6',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E772329',
        service: 'Coursiers',
        password: '$2a$10$P1O2I3U4Y5T6R7E8W9Q0A1S2D3F4G5H6J7K8L9Z0X1C2V3B4N5M6',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E860329',
        service: 'Cantine',
        password: '$2a$10$A1S2D3F4G5H6J7K8L9Z0X1C2V3B4N5M6P7O8I9U0Y1T2R3E4W5Q6',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'SCT=E359329',
        service: 'SMI',
        password: '$2a$10$Z1X2C3V4B5N6M7L8K9J0H1G2F3D4S5A6Q7W8E9R0T1Y2U3I4O5P6',
        passwordChanged: false,
        redirect: 'index.html'
      },
      {
        id: 'Admin',
        service: 'Administrateur',
        password: '$2a$10$X1C2V3B4N5M6P7O8I9U0Y1T2R3E4W5Q6A1S2D3F4G5H6J7K8L9Z0',
        passwordChanged: false,
        redirect: 'admin.html'
      }
    ];

     try {
      for (const account of defaultAccounts) {
        try {
          const existing = await this.getUserByService(account.service);
          if (!existing) {
            await this.saveUser(account);
          }
        } catch (error) {
          console.error(`Erreur initialisation compte ${account.service}:`, error);
        }
      }
    } catch (error) {
      console.error('Erreur initialisation des comptes:', error);
      throw error;
    }
  }
}

// Crée et expose l'instance globale avec vérification
try {
  window.authDB = new AuthDB();
} catch (error) {
  console.error('Erreur création AuthDB:', error);
  window.authDB = null;
}