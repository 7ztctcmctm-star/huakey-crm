const express = require('express');
const app = express();

app.get('/api', (req, res) => {
  let dbStatus = 'pending';
  try {
    const pool = require('./config/database');
    dbStatus = 'pool loaded: ' + typeof pool;
  } catch(e) {
    dbStatus = 'ERROR: ' + e.message;
  }
  res.json({ code: 200, db: dbStatus });
});

module.exports = app;
