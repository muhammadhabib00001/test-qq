const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const { IS_VERCEL } = require('./config');
const dbPath = IS_VERCEL 
  ? '/tmp/database.sqlite' 
  : path.resolve(__dirname, process.env.DATABASE_PATH || 'database.sqlite');

// Ensure db connection is initialized
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Run query helper function wrapped in Promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Get helper function wrapped in Promise
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// All helper function wrapped in Promise
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  // Create tables
  await run(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      bio TEXT,
      role TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      excerpt TEXT,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT,
      author_id INTEGER,
      featured_image TEXT,
      status TEXT DEFAULT 'draft', -- draft, published
      seo_title TEXT,
      seo_description TEXT,
      image_alt TEXT,
      sources TEXT,
      faq TEXT,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES authors(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      source_url TEXT,
      status TEXT DEFAULT 'discovered', -- discovered, generating, ready_for_review, approved, rejected
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT DEFAULT 'info', -- info, error, warning
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Insert default configurations if empty
  const authorCount = await get('SELECT COUNT(*) as count FROM authors');
  if (authorCount.count === 0) {
    await run(`
      INSERT INTO authors (name, slug, bio, role, avatar) VALUES 
      ('Jane Doe', 'jane-doe', 'Senior Editor and Technical Writer with 10+ years of experience in the publishing industry.', 'Senior Editor', '/images/avatars/jane.jpg'),
      ('John Smith', 'john-smith', 'Travel blogger, foodie and freelance lifestyle journalist based in San Francisco.', 'Contributing Writer', '/images/avatars/john.jpg')
    `);
  }

  const settingsCount = await get('SELECT COUNT(*) as count FROM settings');
  if (settingsCount.count === 0) {
    const defaultSettings = [
      { key: 'articles_per_day', value: '2' },
      { key: 'auto_image_gen', value: 'true' },
      { key: 'auto_seo_gen', value: 'true' },
      { key: 'internal_linking', value: 'true' },
      { key: 'approval_workflow', value: 'true' },
      { key: 'publishing_schedule', value: '09:00' },
      { key: 'categories', value: 'Technology,Business,Lifestyle,Travel,Entertainment,Food,Home & Garden,Education,How-To' }
    ];
    for (const setting of defaultSettings) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?)', [setting.key, setting.value]);
    }
  }

  console.log('Database tables successfully initialized.');
}

module.exports = {
  initDb,
  run,
  get,
  all,
  db
};
