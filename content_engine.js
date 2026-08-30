const fs = require('fs');
const path = require('path');
const db = require('./db');
const Parser = require('rss-parser');
const parser = new Parser();
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('Sharp image optimization package failed to load on this serverless environment. Image processing will be bypassed.');
}

// Simple fetch or mock fetch function to grab trending topics if key is missing
async function discoverTopics() {
  console.log('Discovering potential topics...');
  const approvedSources = [
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/PersonalTech.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml'
  ];

  let discoveredCount = 0;
  
  // Try to parse RSS feeds
  for (const source of approvedSources) {
    try {
      console.log(`Parsing feed: ${source}`);
      const feed = await parser.parseURL(source);
      for (const item of feed.items.slice(0, 5)) {
        // Validate and clean categories
        let matchedCategory = 'Technology';
        const title = item.title;
        
        // Simple duplicates filter
        const existing = await db.get('SELECT id FROM topics WHERE title = ?', [title]);
        if (!existing) {
          await db.run(
            'INSERT INTO topics (title, category, source_url, status) VALUES (?, ?, ?, ?)',
            [title, matchedCategory, item.link, 'discovered']
          );
          discoveredCount++;
        }
      }
    } catch (err) {
      console.warn(`Error scraping RSS source ${source}:`, err.message);
    }
  }

  // Fallback default generated ideas if no RSS entries returned
  if (discoveredCount === 0) {
    const mockTopics = [
      { title: 'The Future of AI Assistants in Everyday Life', category: 'Technology' },
      { title: 'How to Manage Remote Teams: A Comprehensive Business Guide', category: 'Business' },
      { title: 'Top 10 Healthy Eating Habits for a Productive Lifestyle', category: 'Lifestyle' },
      { title: 'Exploring the Hidden Gems of Kyoto, Japan', category: 'Travel' },
      { title: 'Creating Your Dream Garden in a Small Suburban Backyard', category: 'Home & Garden' },
      { title: 'The Ultimate Guide to Coding for Beginners', category: 'Education' }
    ];
    for (const t of mockTopics) {
      const existing = await db.get('SELECT id FROM topics WHERE title = ?', [t.title]);
      if (!existing) {
        await db.run(
          'INSERT INTO topics (title, category, source_url, status) VALUES (?, ?, ?, ?)',
          [t.title, t.category, 'https://example.com/source', 'discovered']
        );
        discoveredCount++;
      }
    }
  }

  await db.run('INSERT INTO logs (level, message) VALUES (?, ?)', ['info', `Discovered ${discoveredCount} new topics.`]);
  return discoveredCount;
}

// Resizes and converts standard formats to WebP
async function processFeaturedImage(inputPath, outputFilename) {
  try {
    if (!sharp) {
      console.warn('Sharp is not loaded. Bypassing image processing.');
      return '/images/placeholder.webp';
    }
    const outputDir = path.join(__dirname, 'public', 'images', 'uploads');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, outputFilename);
    
    await sharp(inputPath)
      .resize(1200, 630, { fit: 'cover' }) // Standard social/open graph dimensions
      .webp({ quality: 80 })
      .toFile(outputPath);

    return `/images/uploads/${outputFilename}`;
  } catch (err) {
    console.error('Error optimizing image:', err);
    return null;
  }
}

// Orchestrator for content creation workflow
async function generateArticleFromTopic(topicId) {
  const topic = await db.get('SELECT * FROM topics WHERE id = ?', [topicId]);
  if (!topic) return null;

  console.log(`Starting content generation for: ${topic.title}`);
  await db.run('UPDATE topics SET status = ? WHERE id = ?', ['generating', topicId]);

  try {
    // Check settings for features
    const autoSeo = (await db.get("SELECT value FROM settings WHERE key = 'auto_seo_gen'")).value === 'true';
    const autoImage = (await db.get("SELECT value FROM settings WHERE key = 'auto_image_gen'")).value === 'true';
    const authors = await db.all('SELECT id FROM authors');
    const randomAuthor = authors[Math.floor(Math.random() * authors.length)];

    // Structured fields
    const slug = topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const seoTitle = autoSeo ? `${topic.title} | The Modern Magazine` : topic.title;
    const seoDescription = `Learn about ${topic.title} in this expert guided article. We explore the latest insights and step-by-step guidance.`;
    const imageAlt = `Featured graphic representation for ${topic.title}`;
    
    // Simulate/Generate Body Content
    const body = `
      <h2>Introduction</h2>
      <p>In today's fast-paced world, understanding <strong>${topic.title}</strong> is more critical than ever. Whether you are a seasoned expert or just beginning to explore the subject, staying informed helps you navigate the options available and make better decisions.</p>
      
      <table>
        <thead>
          <tr>
            <th>Key Concept</th>
            <th>Description</th>
            <th>Primary Benefit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Foundation Phase</td>
            <td>Building a base understanding and setting up correct environments.</td>
            <td>Reduces errors down the road.</td>
          </tr>
          <tr>
            <td>Execution Phase</td>
            <td>Utilizing tools and processes to deliver real value.</td>
            <td>Accelerated completion times.</td>
          </tr>
        </tbody>
      </table>

      <h2>Core Strategies and Best Practices</h2>
      <p>Executing on these guidelines will help optimize your overall roadmap. Make sure to define realistic milestones, track progress weekly, and iterate based on metrics and user feedback.</p>
      
      <blockquote>
        "Success is not final, failure is not fatal: it is the courage to continue that counts."
      </blockquote>

      <h2>Step-by-Step Implementation</h2>
      <p>Follow these quick instructions to achieve the best results in your workflow:</p>
      <ul>
        <li><strong>Step 1:</strong> Assess current status and perform initial checks.</li>
        <li><strong>Step 2:</strong> Design the target solution using reliable templates.</li>
        <li><strong>Step 3:</strong> Review structural features and deploy immediately.</li>
      </ul>
    `;

    const faq = JSON.stringify([
      { q: `What is the primary takeaway of ${topic.title}?`, a: "The article highlights setting correct foundations and executing structured steps." },
      { q: "Is this approach suitable for beginners?", a: "Yes, it is structured to guide beginners and offer value to professionals." }
    ]);

    const sources = JSON.stringify([
      { name: "Industry Association Review", url: "https://example.com/industry-review" },
      { name: "Academic Research Hub", url: "https://example.com/research-hub" }
    ]);

    // Mock image generation or handling placeholder
    let finalImageUrl = '/images/placeholder.webp';
    
    // Write placeholder file if not exists
    const placeholderDir = path.join(__dirname, 'public', 'images');
    if (!fs.existsSync(placeholderDir)) {
      fs.mkdirSync(placeholderDir, { recursive: true });
    }
    const placeholderPath = path.join(placeholderDir, 'placeholder.webp');
    if (!fs.existsSync(placeholderPath)) {
      // Create a solid color WebP placeholder using sharp if possible
      try {
        if (sharp) {
          await sharp({
            create: {
              width: 1200,
              height: 630,
              channels: 4,
              background: { r: 52, g: 152, b: 219, alpha: 1 }
            }
          }).webp().toFile(placeholderPath);
        } else {
          fs.writeFileSync(placeholderPath, '');
        }
      } catch (err) {
        console.warn('Could not auto-generate placeholder image, writing raw file.');
        fs.writeFileSync(placeholderPath, '');
      }
    }

    if (autoImage) {
      // Simulate WebP generation and optimization
      const uniqueName = `image-${Date.now()}.webp`;
      const tempPath = path.join(placeholderDir, 'placeholder.webp');
      const processed = await processFeaturedImage(tempPath, uniqueName);
      if (processed) {
        finalImageUrl = processed;
      }
    }

    // Insert article draft into local db
    await db.run(
      `INSERT INTO articles (title, slug, excerpt, body, category, tags, author_id, featured_image, status, seo_title, seo_description, image_alt, sources, faq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        topic.title,
        slug,
        `An insightful look at ${topic.title} to optimize your workflow and increase general knowledge.`,
        body,
        topic.category,
        'automation,guide',
        randomAuthor ? randomAuthor.id : 1,
        finalImageUrl,
        'draft', // Always default to draft for Editorial Review
        seoTitle,
        seoDescription,
        imageAlt,
        sources,
        faq
      ]
    );

    await db.run('UPDATE topics SET status = ? WHERE id = ?', ['ready_for_review', topicId]);
    await db.run('INSERT INTO logs (level, message) VALUES (?, ?)', ['info', `Generated article draft: ${topic.title}`]);
    console.log(`Finished content generation: ${topic.title}`);
    return true;
  } catch (err) {
    console.error('Failed content generation:', err);
    await db.run('UPDATE topics SET status = ? WHERE id = ?', ['discovered', topicId]);
    await db.run('INSERT INTO logs (level, message) VALUES (?, ?)', ['error', `Failed to generate article: ${err.message}`]);
    return false;
  }
}

module.exports = {
  discoverTopics,
  generateArticleFromTopic,
  processFeaturedImage
};
