const express = require('express');
const router = express.Router();
const db = require('./db');
const contentEngine = require('./content_engine');
let xmlbuilder2;
try {
  xmlbuilder2 = require('xmlbuilder2');
} catch (e) {
  console.warn('xmlbuilder2 package failed to load. XML Sitemap format will degrade gracefully.');
}

// ==========================================
// Middleware for Admin Authentication
// ==========================================
function isAdmin(req, res, next) {
  // Simple session authentication mock
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Homepage
router.get('/', async (req, res, next) => {
  try {
    const featured = await db.get("SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.status = 'published' ORDER BY a.created_at DESC LIMIT 1");
    const latest = await db.all("SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.status = 'published' ORDER BY a.created_at DESC LIMIT 6");
    const popular = await db.all("SELECT * FROM articles WHERE status = 'published' ORDER BY views DESC LIMIT 5");
    const categories = (await db.get("SELECT value FROM settings WHERE key = 'categories'")).value.split(',');

    res.render('index', {
      featured,
      latest: featured ? latest.filter(a => a.id !== featured.id) : latest,
      popular,
      categories,
      pageTitle: 'Home | The Editorial Magazine'
    });
  } catch (err) {
    next(err);
  }
});

// Single Article Page
router.get('/article/:slug', async (req, res, next) => {
  try {
    const article = await db.get(
      "SELECT a.*, aut.name as author_name, aut.bio as author_bio, aut.avatar as author_avatar, aut.role as author_role FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.slug = ?",
      [req.params.slug]
    );

    if (!article) {
      return res.status(404).render('static', { pageTitle: 'Not Found', title: 'Page Not Found', content: '<p>The requested article could not be found.</p>' });
    }

    // Increment views asynchronously
    db.run("UPDATE articles SET views = views + 1 WHERE id = ?", [article.id]);

    const related = await db.all("SELECT * FROM articles WHERE category = ? AND id != ? AND status = 'published' LIMIT 3", [article.category, article.id]);
    
    // Parse FAQ & Sources safely
    let faq = [];
    let sources = [];
    try { faq = JSON.parse(article.faq || '[]'); } catch(e){}
    try { sources = JSON.parse(article.sources || '[]'); } catch(e){}

    res.render('article', {
      article,
      related,
      faq,
      sources,
      pageTitle: article.seo_title || article.title
    });
  } catch (err) {
    next(err);
  }
});

// Category/Archive view
router.get('/category/:category', async (req, res, next) => {
  try {
    const articles = await db.all("SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.category = ? AND a.status = 'published' ORDER BY a.created_at DESC", [req.params.category]);
    res.render('archive', {
      title: req.params.category,
      articles,
      pageTitle: `${req.params.category} | Archive`
    });
  } catch (err) {
    next(err);
  }
});

// Search functionality
router.get('/search', async (req, res, next) => {
  const query = req.query.q || '';
  try {
    const articles = await db.all(
      "SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.status = 'published' AND (a.title LIKE ? OR a.body LIKE ?) ORDER BY a.created_at DESC",
      [`%${query}%`, `%${query}%`]
    );
    res.render('archive', {
      title: `Search results for: "${query}"`,
      articles,
      pageTitle: `Search: ${query}`
    });
  } catch (err) {
    next(err);
  }
});

// Author Profile Pages
router.get('/author/:slug', async (req, res, next) => {
  try {
    const author = await db.get('SELECT * FROM authors WHERE slug = ?', [req.params.slug]);
    if (!author) {
      return res.status(404).render('static', { pageTitle: 'Not Found', title: 'Author Not Found', content: '<p>The requested author could not be found.</p>' });
    }
    const articles = await db.all("SELECT * FROM articles WHERE author_id = ? AND status = 'published' ORDER BY created_at DESC", [author.id]);
    res.render('author', {
      author,
      articles,
      pageTitle: `${author.name} | Author Profile`
    });
  } catch (err) {
    next(err);
  }
});

// XML Sitemap for Search Engine Crawler Optimization
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const articles = await db.all("SELECT slug, updated_at FROM articles WHERE status = 'published'");
    const host = `${req.protocol}://${req.get('host')}`;
    
    if (!xmlbuilder2) {
      // Graceful raw string sitemap fallback
      let rawXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      rawXml += `  <url>\n    <loc>${host}</loc>\n    <priority>1.0</priority>\n  </url>\n`;
      for (const art of articles) {
        const lastmod = new Date(art.updated_at).toISOString().split('T')[0];
        rawXml += `  <url>\n    <loc>${host}/article/${art.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }
      rawXml += `</urlset>`;
      res.header('Content-Type', 'application/xml');
      return res.send(rawXml);
    }

    const root = xmlbuilder2.create({ version: '1.0', encoding: 'UTF-8' })
      .ele('urlset', { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' });

    // Home
    root.ele('url').ele('loc').txt(host).up().ele('priority').txt('1.0').up().up();

    // Articles
    for (const art of articles) {
      root.ele('url')
        .ele('loc').txt(`${host}/article/${art.slug}`).up()
        .ele('lastmod').txt(new Date(art.updated_at).toISOString().split('T')[0]).up()
        .ele('changefreq').txt('weekly').up()
        .ele('priority').txt('0.8').up()
        .up();
    }

    const xml = root.end({ prettyPrint: true });
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

// Reusable Static Pages mapping
const staticPages = {
  'about-us': { title: 'About Us', content: '<p>We are a professional, modern general-interest magazine focused on delivering high-quality, verified, and engaging articles across tech, business, and lifestyle.</p>' },
  'contact-us': { title: 'Contact Us', content: '<p>Have questions or feedback? Please contact our editorial desk at editor@example.com.</p>' },
  'privacy-policy': { title: 'Privacy Policy', content: '<p>This policy details how we handle user data. We value privacy and adhere to modern GDPR and CCPA standards.</p>' },
  'terms-conditions': { title: 'Terms & Conditions', content: '<p>Use of our platform constitutes acceptance of these terms and service guidelines.</p>' },
  'disclaimer': { title: 'Disclaimer', content: '<p>The content published on this platform is for general informational and entertainment purposes only.</p>' },
  'cookie-policy': { title: 'Cookie Policy', content: '<p>We use essential cookies to provide user interface selections and analytics.</p>' },
  'editorial-policy': { title: 'Editorial Policy', content: '<p>We strive for accuracy, clarity, and fairness. All AI-assisted contents undergo mandatory human editorial review before publishing.</p>' },
  'corrections-policy': { title: 'Corrections Policy', content: '<p>If you find errors in our reporting, please contact us for immediate corrections.</p>' },
  'our-team': { title: 'Authors & Our Team', content: '<p>Meet our editorial panel dedicated to reporting authentic stories.</p>' },
  'advertising': { title: 'Advertising', content: '<p>Interested in advertising with us? Email us to request our Media Kit and ad guidelines.</p>' },
  'accessibility': { title: 'Accessibility Statement', content: '<p>We are committed to making our site accessible to everyone, following WCAG 2.1 Level AA standards.</p>' }
};

router.get('/page/:slug', (req, res) => {
  const page = staticPages[req.params.slug];
  if (!page) {
    return res.status(404).render('static', { pageTitle: 'Not Found', title: 'Page Not Found', content: '<p>The requested page could not be found.</p>' });
  }
  res.render('static', {
    pageTitle: `${page.title} | Magazine`,
    title: page.title,
    content: page.content
  });
});

// ==========================================
// ADMIN PANEL ROUTES
// ==========================================

// Login page
router.get('/admin/login', (req, res) => {
  res.render('admin/login', { pageTitle: 'Admin Login', error: null });
});

router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const targetUser = process.env.ADMIN_USER || 'admin';
  const targetPass = process.env.ADMIN_PASS || 'admin123';
  
  if (username === targetUser && password === targetPass) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { pageTitle: 'Admin Login', error: 'Invalid username or password' });
});

// Logout
router.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Dashboard Home
router.get('/admin', isAdmin, async (req, res, next) => {
  try {
    const counts = {
      topics: (await db.get("SELECT COUNT(*) as count FROM topics")).count,
      generated: (await db.get("SELECT COUNT(*) as count FROM articles")).count,
      pending: (await db.get("SELECT COUNT(*) as count FROM articles WHERE status = 'draft'")).count,
      published: (await db.get("SELECT COUNT(*) as count FROM articles WHERE status = 'published'")).count,
    };

    const topicsList = await db.all("SELECT * FROM topics ORDER BY created_at DESC LIMIT 10");
    const articlesList = await db.all("SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id ORDER BY a.created_at DESC LIMIT 10");
    const logsList = await db.all("SELECT * FROM logs ORDER BY created_at DESC LIMIT 10");

    res.render('admin/dashboard', {
      pageTitle: 'Admin Dashboard',
      counts,
      topics: topicsList,
      articles: articlesList,
      logs: logsList
    });
  } catch (err) {
    next(err);
  }
});

// Controls & Settings Panel
router.get('/admin/settings', isAdmin, async (req, res, next) => {
  try {
    const rawSettings = await db.all('SELECT * FROM settings');
    const settings = {};
    rawSettings.forEach(s => settings[s.key] = s.value);
    
    res.render('admin/settings', {
      pageTitle: 'Controls Panel',
      settings
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/settings', isAdmin, async (req, res, next) => {
  try {
    const keys = ['articles_per_day', 'auto_image_gen', 'auto_seo_gen', 'internal_linking', 'approval_workflow', 'publishing_schedule'];
    for (const key of keys) {
      const val = req.body[key] || 'false';
      await db.run('UPDATE settings SET value = ? WHERE key = ?', [val, key]);
    }
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

// Review & Approval panel
router.get('/admin/review', isAdmin, async (req, res, next) => {
  try {
    const articles = await db.all("SELECT a.*, aut.name as author_name FROM articles a LEFT JOIN authors aut ON a.author_id = aut.id WHERE a.status = 'draft' ORDER BY a.created_at DESC");
    res.render('admin/review', {
      pageTitle: 'Awaiting Editorial Review',
      articles
    });
  } catch (err) {
    next(err);
  }
});

// Edit & review specific article draft
router.get('/admin/article/edit/:id', isAdmin, async (req, res, next) => {
  try {
    const article = await db.get("SELECT * FROM articles WHERE id = ?", [req.params.id]);
    const authors = await db.all("SELECT * FROM authors");
    const categories = (await db.get("SELECT value FROM settings WHERE key = 'categories'")).value.split(',');

    res.render('admin/article_edit', {
      pageTitle: `Reviewing: ${article.title}`,
      article,
      authors,
      categories
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/article/edit/:id', isAdmin, async (req, res, next) => {
  const { title, excerpt, body, category, author_id, seo_title, seo_description, image_alt, status } = req.body;
  try {
    await db.run(
      `UPDATE articles SET title = ?, excerpt = ?, body = ?, category = ?, author_id = ?, seo_title = ?, seo_description = ?, image_alt = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [title, excerpt, body, category, author_id, seo_title, seo_description, image_alt, status, req.params.id]
    );
    res.redirect('/admin/review');
  } catch (err) {
    next(err);
  }
});

// Action trigger to discover and generate immediately
router.post('/admin/trigger-automation', isAdmin, async (req, res, next) => {
  try {
    // 1. Discover Topics
    await contentEngine.discoverTopics();

    // 2. Grab oldest discovered topic and generate it
    const topic = await db.get("SELECT id FROM topics WHERE status = 'discovered' ORDER BY created_at ASC LIMIT 1");
    if (topic) {
      await contentEngine.generateArticleFromTopic(topic.id);
    }
    
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
