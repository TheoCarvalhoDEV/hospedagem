// backend/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token missing' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // attach user info (id, role, email)
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

module.exports = { authMiddleware };
