class AuthDB {
  constructor() {
    this.dbPromise = this.initDB();
  }

  initDB() {
    return idb.open('AuthDatabase', 1, upgradeDB => {
      if (!upgradeDB.objectStoreNames.contains('users')) {
        const store = upgradeDB.createObjectStore('users', { keyPath: 'id' });
        store.createIndex('by_service', 'service', { unique: true });
      }
    });
  }

  async saveUser(user) {
    const db = await this.dbPromise;
    const tx = db.transaction('users', 'readwrite');
    await tx.objectStore('users').put(user);
    await tx.complete;
    return user;
  }

  async getUserById(id) {
    const db = await this.dbPromise;
    return db.transaction('users')
      .objectStore('users').get(id);
  }

  async getUserByService(service) {
    const db = await this.dbPromise;
    return db.transaction('users')
      .objectStore('users')
      .index('by_service')
      .get(service);
  }

  async initializeDefaultAccounts() {
    const defaultAccounts = [
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
      // Ajoutez tous les autres services ici...
      {
        id: 'Admin',
        service: 'Administrateur',
        password: '$2a$10$3yD5X9W8N6vB2C1A0Z.Y.uJk7QYJZwjZJQwO.9w9j9t0J9z0J9z0J9',
        passwordChanged: false,
        redirect: 'admin.html'
      }
    ];

    for (const account of defaultAccounts) {
      const existing = await this.getUserByService(account.service);
      if (!existing) {
        await this.saveUser(account);
        console.log(`Compte ${account.service} initialisé`);
      }
    }
  }
}

const authDB = new AuthDB();