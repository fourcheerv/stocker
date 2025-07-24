require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cors = require('cors');
const PouchDB = require('pouchdb'); // Assurez-vous d'installer PouchDB avec `npm install pouchdb`
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY;
const COUCHDB_URL = process.env.COUCHDB_URL;
const API_KEY = process.env.API_KEY;

app.use(cors());
app.use(express.json());

const localDB = new PouchDB('stocks');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.post('/login', (req, res) => {
  const username = req.body.username;
  const user = { name: username };
  const accessToken = jwt.sign(user, SECRET_KEY, { expiresIn: '1h' });
  res.json({ accessToken });
});

app.get('/api/data', authenticateToken, async (req, res) => {
  try {
    const response = await localDB.allDocs({ include_docs: true });
    const data = response.rows.map(row => row.doc);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/data', authenticateToken, async (req, res) => {
  try {
    const record = req.body;
    const response = await localDB.post(record);
    res.status(201).json(response);
  } catch (error) {
    console.error("Erreur lors de l'enregistrement:", error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
