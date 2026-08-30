require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

function fsExists(p) {
  const fs = require('fs');
  return fs.existsSync(p);
}
function fsMkdir(p) {
  const fs = require('fs');
  fs.mkdirSync(p, { recursive: true });
}

const { IS_VERCEL } = require('./config');

// Setup directories
const publicDir = path.join(__dirname, 'public');
const viewsDir = path.join(__dirname, 'views');
const uploadDir = path.join(publicDir, 'images', 'uploads');

if (!IS_VERCEL) {
  if (!fsExists(publicDir)) fsMkdir(publicDir);
  if (!fsExists(path.join(publicDir, 'images'))) fsMkdir(path.join(publicDir, 'images'));
  if (!fsExists(uploadDir)) fsMkdir(uploadDir);
}

// Session configuration
app.use(session({
  secret: 'editorial-secret-key-1298471',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Body parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EJS View Engine
app.set('view engine', 'ejs');
app.set('views', viewsDir);

// Static assets
app.use(express.static(publicDir));

// Connect all routes
const routes = require('./routes');
app.use('/', routes);

// Boot DB & Server
db.initDb().then(() => {
  console.log('Database successfully initialized.');
}).catch(err => {
  console.warn('Database initialization warning (likely read-only serverless environment):', err.message);
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
