require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./db');
const { IS_VERCEL } = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories (skip on Vercel read-only filesystem)
if (!IS_VERCEL) {
  const fs = require('fs');
  const publicDir = path.join(__dirname, 'public');
  const uploadDir = path.join(publicDir, 'images', 'uploads');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(path.join(publicDir, 'images'))) fs.mkdirSync(path.join(publicDir, 'images'), { recursive: true });
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

// Session configuration
app.set('trust proxy', 1);
app.use(session({
  secret: 'editorial-secret-key-1298471',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: false,
    sameSite: 'lax'
  }
}));

// Body parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Connect all routes
const routes = require('./routes');
app.use('/', routes);

// ==========================================
// GLOBAL ERROR HANDLER - catches all errors
// ==========================================
app.use(function(err, req, res, next) {
  console.error('EXPRESS ERROR:', err.stack || err.message || err);
  res.status(500).send(
    '<h1>Server Error</h1><pre>' + 
    (err.message || 'Unknown error') + 
    '</pre><p>Check Vercel function logs for details.</p>'
  );
});

// Boot DB (non-blocking)
db.initDb().then(() => {
  console.log('Database successfully initialized.');
}).catch(err => {
  console.warn('Database initialization warning:', err.message);
});

// Only listen when NOT on Vercel (Vercel uses the exported app)
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

// CRITICAL: Export app for Vercel serverless
module.exports = app;
