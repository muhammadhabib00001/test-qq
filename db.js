const path = require('path');
const fs = require('fs');

const { IS_VERCEL } = require('./config');
let sqlite3;
let db = null;
let isMockDb = false;

try {
  sqlite3 = require('sqlite3').verbose();
  const dbPath = IS_VERCEL 
    ? '/tmp/database.sqlite' 
    : path.resolve(__dirname, process.env.DATABASE_PATH || 'database.sqlite');
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Database connection error:', err.message);
      isMockDb = true;
    } else {
      console.log('Connected to the SQLite database.');
    }
  });
} catch (e) {
  console.warn('SQLite3 native driver failed loading. Initializing mock serverless DB simulator.');
  isMockDb = true;
}

// Mock in-memory database storage
const mockStore = {
  authors: [
    { id: 1, name: 'Jane Doe', slug: 'jane-doe', bio: 'Senior Editor and Technical Writer with 10+ years of experience in the publishing industry.', role: 'Senior Editor', avatar: '/images/avatars/jane.jpg' },
    { id: 2, name: 'John Smith', slug: 'john-smith', bio: 'Travel blogger, foodie and freelance lifestyle journalist based in San Francisco.', role: 'Contributing Writer', avatar: '/images/avatars/john.jpg' }
  ],
  articles: [
    {
      id: 1,
      title: 'The Future of AI Assistants in Everyday Life',
      slug: 'the-future-of-ai-assistants-in-everyday-life',
      excerpt: 'Discover how modern artificial intelligence tools are reshaping daily productivity, automation, and digital lifestyles.',
      body: '<h2>Executive Summary</h2><p>Artificial intelligence is moving rapidly from specialized labs directly into everyday application. From automated writing tools to smart home controls, AI assistants are establishing new paradigms for personal productivity.</p><h2>Key Advancements</h2><p>Modern language models can summarize documents, generate code, assist with scheduling, and curate personalized news feeds effortlessly.</p><blockquote>"Automation is not about replacing human creativity, but amplifying it."</blockquote>',
      category: 'Technology',
      tags: 'ai,tech,future',
      author_id: 1,
      featured_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      status: 'published',
      seo_title: 'The Future of AI Assistants in Everyday Life | Magazine',
      seo_description: 'Discover how modern AI tools reshape productivity and lifestyle.',
      image_alt: 'AI assistant graphic',
      sources: '[]',
      faq: '[]',
      views: 242,
      created_at: new Date(Date.now() - 3600000),
      updated_at: new Date(Date.now() - 3600000)
    },
    {
      id: 2,
      title: 'How to Manage Remote Teams: A Business Guide',
      slug: 'how-to-manage-remote-teams-a-business-guide',
      excerpt: 'Essential frameworks, communication tools, and workflow strategies for leading distributed workforces successfully.',
      body: '<h2>Introduction</h2><p>Managing remote teams requires deliberate communication protocols and outcome-focused performance tracking.</p><h2>Best Practices</h2><ul><li>Set clear daily objectives</li><li>Maintain async documentation</li><li>Encourage regular virtual check-ins</li></ul>',
      category: 'Business',
      tags: 'management,remote,business',
      author_id: 2,
      featured_image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80',
      status: 'published',
      seo_title: 'How to Manage Remote Teams: A Business Guide | Magazine',
      seo_description: 'Essential frameworks and workflow strategies for leading remote teams.',
      image_alt: 'Remote team management',
      sources: '[]',
      faq: '[]',
      views: 189,
      created_at: new Date(Date.now() - 7200000),
      updated_at: new Date(Date.now() - 7200000)
    },
    {
      id: 3,
      title: 'Exploring the Hidden Gems of Kyoto: Travel Guide',
      slug: 'exploring-the-hidden-gems-of-kyoto-travel-guide',
      excerpt: 'Step off the beaten path in Japan’s cultural capital to discover tranquil temples, bamboo groves, and traditional tea houses.',
      body: '<h2>Introduction</h2><p>Kyoto is renowned for its historic shrines, but beyond the popular tourist hubs lie quiet neighborhoods rich in heritage and serene beauty.</p><h2>Top Destinations</h2><p>Explore Arashiyama’s secluded paths, historic Gion alleyways, and quiet zen gardens far from the crowds.</p>',
      category: 'Travel',
      tags: 'japan,travel,culture',
      author_id: 2,
      featured_image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80',
      status: 'published',
      seo_title: 'Exploring the Hidden Gems of Kyoto | Magazine',
      seo_description: 'Discover tranquil temples and traditional tea houses in Kyoto.',
      image_alt: 'Kyoto bamboo grove',
      sources: '[]',
      faq: '[]',
      views: 156,
      created_at: new Date(Date.now() - 10800000),
      updated_at: new Date(Date.now() - 10800000)
    },
    {
      id: 4,
      title: 'Top 10 Healthy Habits for Sustainable Productivity',
      slug: 'top-10-healthy-habits-for-sustainable-productivity',
      excerpt: 'Optimize your daily routine with evidence-based habits that boost focus, physical wellness, and mental clarity.',
      body: '<h2>Introduction</h2><p>True productivity is not about working longer hours; it is about managing energy, focus, and physical well-being efficiently.</p><h2>Core Wellness Pillars</h2><ul><li>Prioritize quality sleep architecture</li><li>Incorporate movement breaks</li><li>Practice mindful time blocking</li></ul>',
      category: 'Lifestyle',
      tags: 'wellness,health,productivity',
      author_id: 1,
      featured_image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80',
      status: 'published',
      seo_title: 'Top 10 Healthy Habits for Sustainable Productivity | Magazine',
      seo_description: 'Optimize daily routine with evidence-based wellness habits.',
      image_alt: 'Healthy lifestyle habits',
      sources: '[]',
      faq: '[]',
      views: 210,
      created_at: new Date(Date.now() - 14400000),
      updated_at: new Date(Date.now() - 14400000)
    },
    {
      id: 5,
      title: 'The Ultimate Guide to Modern Software Architecture',
      slug: 'the-ultimate-guide-to-modern-software-architecture',
      excerpt: 'Learn key principles of microservices, serverless deployments, and resilient API design in modern software engineering.',
      body: '<h2>Introduction</h2><p>Designing modern applications requires balancing scalability, developer velocity, and maintainability across distributed cloud environments.</p><h2>Key Architectural Patterns</h2><p>From event-driven systems to serverless functions, modern architectures prioritize decoupling and observability.</p>',
      category: 'Education',
      tags: 'coding,architecture,tech',
      author_id: 1,
      featured_image: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80',
      status: 'published',
      seo_title: 'The Ultimate Guide to Modern Software Architecture | Magazine',
      seo_description: 'Learn microservices, serverless, and resilient API design.',
      image_alt: 'Software architecture guide',
      sources: '[]',
      faq: '[]',
      views: 312,
      created_at: new Date(Date.now() - 18000000),
      updated_at: new Date(Date.now() - 18000000)
    },
    {
      id: 6,
      title: 'Creating Your Dream Backyard Garden: Beginner Tips',
      slug: 'creating-your-dream-backyard-garden-beginner-tips',
      excerpt: 'Transform your outdoor space into a lush haven with simple soil preparation, plant selection, and sustainable landscaping.',
      body: '<h2>Introduction</h2><p>Gardening is one of the most rewarding outdoor hobbies. Whether working with a spacious yard or a modest patio, thoughtful design creates a vibrant green space.</p>',
      category: 'Home & Garden',
      tags: 'gardening,home,outdoors',
      author_id: 2,
      featured_image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
      status: 'published',
      seo_title: 'Creating Your Dream Backyard Garden: Beginner Tips | Magazine',
      seo_description: 'Transform your outdoor space into a lush haven.',
      image_alt: 'Backyard garden design',
      sources: '[]',
      faq: '[]',
      views: 128,
      created_at: new Date(Date.now() - 21600000),
      updated_at: new Date(Date.now() - 21600000)
    }
  ],
  topics: [
    { id: 1, title: 'The Future of AI Assistants in Everyday Life', category: 'Technology', source_url: 'https://example.com', status: 'approved', created_at: new Date() },
    { id: 2, title: 'Exploring the Hidden Gems of Kyoto, Japan', category: 'Travel', source_url: 'https://example.com', status: 'discovered', created_at: new Date() }
  ],
  logs: [
    { level: 'info', message: 'Database initialized with seed content.', created_at: new Date() }
  ],
  settings: {
    articles_per_day: '6',
    auto_image_gen: 'true',
    auto_seo_gen: 'true',
    internal_linking: 'true',
    approval_workflow: 'true',
    publishing_schedule: '09:00',
    categories: 'Technology,Business,Lifestyle,Travel,Entertainment,Food,Home & Garden,Education,How-To'
  }
};

// Run query helper function wrapped in Promise
function run(sql, params = []) {
  if (isMockDb) {
    console.log('[MockDB Run]', sql, params);
    // Basic mock handlers
    if (sql.includes('INSERT INTO topics')) {
      mockStore.topics.push({ id: mockStore.topics.length + 1, title: params[0], category: params[1], source_url: params[2], status: params[3] || 'discovered', created_at: new Date() });
    } else if (sql.includes('INSERT INTO articles')) {
      mockStore.articles.push({
        id: mockStore.articles.length + 1,
        title: params[0], slug: params[1], excerpt: params[2], body: params[3], category: params[4], tags: params[5],
        author_id: params[6], featured_image: params[7], status: params[8], seo_title: params[9], seo_description: params[10],
        image_alt: params[11], sources: params[12], faq: params[13], views: 0, created_at: new Date(), updated_at: new Date()
      });
    } else if (sql.includes('INSERT INTO logs')) {
      mockStore.logs.push({ level: params[0], message: params[1], created_at: new Date() });
    } else if (sql.includes('UPDATE settings')) {
      mockStore.settings[params[1]] = params[0];
    } else if (sql.includes('UPDATE topics SET status')) {
      const topic = mockStore.topics.find(t => t.id === params[1]);
      if (topic) topic.status = params[0];
    } else if (sql.includes('UPDATE articles SET status =')) {
      if (sql.includes('WHERE id =')) {
        const targetId = parseInt(params[0], 10) || params[0];
        const art = mockStore.articles.find(a => a.id == targetId);
        if (art) {
          art.status = 'published';
          art.updated_at = new Date();
        }
      } else {
        // Direct batch status update (e.g. UPDATE articles SET status = 'published' WHERE status = 'draft')
        mockStore.articles.forEach(a => {
          if (!sql.includes('WHERE status =') || a.status === 'draft') {
            a.status = 'published';
            a.updated_at = new Date();
          }
        });
      }
    } else if (sql.includes('UPDATE articles SET title')) {
      const artId = parseInt(params[9], 10) || params[9];
      const art = mockStore.articles.find(a => a.id == artId);
      if (art) {
        art.title = params[0]; art.excerpt = params[1]; art.body = params[2]; art.category = params[3];
        art.author_id = params[4]; art.seo_title = params[5]; art.seo_description = params[6];
        art.image_alt = params[7]; art.status = params[8]; art.updated_at = new Date();
      }
    }
    return Promise.resolve({ lastID: 1 });
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Get helper function wrapped in Promise
function get(sql, params = []) {
  if (isMockDb) {
    console.log('[MockDB Get]', sql, params);
    if (sql.includes('SELECT COUNT(*) as count FROM authors')) {
      return Promise.resolve({ count: mockStore.authors.length });
    } else if (sql.includes('SELECT COUNT(*) as count FROM settings')) {
      return Promise.resolve({ count: Object.keys(mockStore.settings).length });
    } else if (sql.includes('SELECT COUNT(*) as count FROM topics')) {
      return Promise.resolve({ count: mockStore.topics.length });
    } else if (sql.includes('SELECT COUNT(*) as count FROM articles WHERE status = \'draft\'')) {
      return Promise.resolve({ count: mockStore.articles.filter(a => a.status === 'draft').length });
    } else if (sql.includes('SELECT COUNT(*) as count FROM articles WHERE status = \'published\'')) {
      return Promise.resolve({ count: mockStore.articles.filter(a => a.status === 'published').length });
    } else if (sql.includes('SELECT COUNT(*) as count FROM articles')) {
      return Promise.resolve({ count: mockStore.articles.length });
    } else if (sql.includes('SELECT value FROM settings WHERE key =')) {
      // Find key in sql e.g. key = 'categories'
      const match = sql.match(/key = '([^']+)'/) || sql.match(/key = \?/);
      const key = match ? (match[1] === '?' ? params[0] : match[1]) : '';
      return Promise.resolve({ value: mockStore.settings[key] || '' });
    } else if (sql.includes('SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.status = \'published\' ORDER BY a.created_at DESC LIMIT 1')) {
      const art = mockStore.articles.filter(a => a.status === 'published')[0];
      if (art) {
        const aut = mockStore.authors.find(a => a.id === art.author_id) || {};
        return Promise.resolve({ ...art, author_name: aut.name });
      }
      return Promise.resolve(null);
    } else if (sql.includes('SELECT a.*, aut.name as author_name') && sql.includes('a.slug = ?')) {
      const art = mockStore.articles.find(a => a.slug === params[0]);
      if (art) {
        const aut = mockStore.authors.find(a => a.id === art.author_id) || {};
        return Promise.resolve({
          ...art,
          author_name: aut.name,
          author_bio: aut.bio,
          author_avatar: aut.avatar,
          author_role: aut.role
        });
      }
      return Promise.resolve(null);
    } else if (sql.includes('SELECT * FROM authors WHERE slug = ?')) {
      return Promise.resolve(mockStore.authors.find(a => a.slug === params[0]) || null);
    } else if (sql.includes('SELECT * FROM articles WHERE id = ?')) {
      return Promise.resolve(mockStore.articles.find(a => a.id === params[0]) || null);
    } else if (sql.includes('SELECT id FROM topics WHERE status = \'discovered\'')) {
      return Promise.resolve(mockStore.topics.find(t => t.status === 'discovered') || null);
    } else if (sql.includes('SELECT id FROM topics WHERE title = ?')) {
      return Promise.resolve(mockStore.topics.find(t => t.title === params[0]) || null);
    }
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// All helper function wrapped in Promise
function all(sql, params = []) {
  if (isMockDb) {
    console.log('[MockDB All]', sql, params);
    if (sql.includes('SELECT * FROM settings')) {
      return Promise.resolve(Object.keys(mockStore.settings).map(k => ({ key: k, value: mockStore.settings[k] })));
    } else if (sql.includes('SELECT * FROM authors')) {
      return Promise.resolve(mockStore.authors);
    } else if (sql.includes('SELECT * FROM topics')) {
      return Promise.resolve(mockStore.topics.slice(-10));
    } else if (sql.includes('SELECT * FROM logs')) {
      return Promise.resolve(mockStore.logs.slice(-10));
    } else if (sql.includes('SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.status = \'draft\'')) {
      return Promise.resolve(mockStore.articles.filter(a => a.status === 'draft').map(art => {
        const aut = mockStore.authors.find(a => a.id === art.author_id) || {};
        return { ...art, author_name: aut.name };
      }));
    } else if (sql.includes('SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.status = \'published\'') || sql.includes('SELECT a.*, aut.name as author_name FROM articles a')) {
      let filtered = mockStore.articles;
      if (sql.includes('a.category = ?')) {
        filtered = filtered.filter(a => a.category === params[0]);
      }
      return Promise.resolve(filtered.map(art => {
        const aut = mockStore.authors.find(a => a.id === art.author_id) || {};
        return { ...art, author_name: aut.name };
      }));
    } else if (sql.includes('SELECT * FROM articles WHERE category = ?')) {
      return Promise.resolve(mockStore.articles.filter(a => a.category === params[0] && a.id !== params[1] && a.status === 'published').slice(0, 3));
    } else if (sql.includes('SELECT * FROM articles WHERE author_id = ?')) {
      return Promise.resolve(mockStore.articles.filter(a => a.author_id === params[0] && a.status === 'published'));
    } else if (sql.includes('SELECT * FROM articles WHERE status = \'published\'')) {
      return Promise.resolve(mockStore.articles.filter(a => a.status === 'published').slice(0, 5));
    }
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  if (isMockDb) {
    console.log('Mock database initialized successfully.');
    return Promise.resolve();
  }
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
