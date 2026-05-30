const express = require('express');
require('dotenv').config();
const app = express();

app.use(require('cors')({ origin: '*', credentials: true }));
app.use(express.json());

// Step 3: 加 auth 路由
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

app.get('/api', (req, res) => {
  res.json({ code: 200, message: 'Step 3 OK', routes: ['/api/auth/login'] });
});

module.exports = app;
