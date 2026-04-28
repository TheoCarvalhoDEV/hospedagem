// backend/src/services/authService.js

// Simple in‑memory user store for demo purposes (replace with DB later)
const users = [
  {
    id: 1,
    email: "admin@lexgen.com",
    password: "admin123", // in real app use hashed passwords
    role: "admin",
  },
  {
    id: 2,
    email: "advogado@lexgen.com",
    password: "adv123",
    role: "advogado",
  },
  {
    id: 3,
    email: "assistente@lexgen.com",
    password: "assist123",
    role: "assistente",
  },
];

function findUserByEmail(email) {
  return users.find((u) => u.email === email);
}

module.exports = { findUserByEmail };
