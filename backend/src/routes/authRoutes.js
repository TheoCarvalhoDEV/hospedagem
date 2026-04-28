// backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { findUserByEmail } = require('../services/authService');

// Load JWT secret from env (already defined in .env)
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

// Login endpoint – returns JWT and user role
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    // In production use hashed passwords and constant‑time compare
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
  return res.json({ success: true, token, role: user.role, email: user.email });
});

module.exports = router;
