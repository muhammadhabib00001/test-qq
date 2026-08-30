const db = require('./db');
const { IS_VERCEL } = require('./config');

let Parser;
let parser;
try {
  Parser = require('rss-parser');
  parser = new Parser();
} catch (e) {
  console.warn('rss-parser failed to load. RSS discovery will use fallback topics.');
}

let GoogleGenAI;
try {
  const genaiModule = require('@google/genai');
  GoogleGenAI = genaiModule.GoogleGenAI;
} catch (e) {
  console.warn('@google/genai SDK failed to load:', e.message);
}

// Discover potential topics via RSS feeds or fallback generator
async function discoverTopics() {
  console.log('Discovering potential topics...');
  let discoveredCount = 0;

  if (parser) {
    const approvedSources = [
      'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/PersonalTech.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml'
    ];

    for (const source of approvedSources) {
      try {
        console.log(`Parsing feed: ${source}`);
        const feed = await parser.parseURL(source);
        for (const item of feed.items.slice(0, 5)) {
          let matchedCategory = 'Technology';
          const title = item.title;
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

// Generate complete article using Google Gemini API or template fallback
async function generateArticleFromTopic(topicId) {
  const topic = await db.get('SELECT * FROM topics WHERE id = ?', [topicId]);
  if (!topic) return null;

  console.log(`Starting content generation for: ${topic.title}`);
  await db.run('UPDATE topics SET status = ? WHERE id = ?', ['generating', topicId]);

  try {
    const autoSeoSetting = await db.get("SELECT value FROM settings WHERE key = 'auto_seo_gen'");
    const autoSeo = autoSeoSetting ? autoSeoSetting.value === 'true' : true;
    const authors = await db.all('SELECT id FROM authors') || [{ id: 1 }];
    const randomAuthor = authors[Math.floor(Math.random() * authors.length)];

    let slug = topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let seoTitle = autoSeo ? `${topic.title} | The Editorial Magazine` : topic.title;
    let seoDescription = `Learn about ${topic.title} in this expert guided article. We explore the latest insights and step-by-step guidance.`;
    let imageAlt = `Featured graphic representation for ${topic.title}`;
    let body = '';
    let faq = [];
    let sources = [];
    let excerpt = `An insightful look at ${topic.title} to optimize your workflow and increase general knowledge.`;

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && GoogleGenAI) {
      console.log('Generating content via Google Gemini API...');
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `You are a professional magazine editor and SEO content creator. Write an in-depth, engaging article on the topic: "${topic.title}" in category "${topic.category}".
      
      Return ONLY valid JSON matching this exact structure with no Markdown wrapping or code fences:
      {
        "excerpt": "A compelling 2-sentence summary of the article.",
        "body": "Full article body formatted in semantic HTML (h2, h3, p, ul, li, blockquote, table). Must contain at least 4 detailed sections.",
        "seoTitle": "Catchy SEO Title (50-60 chars)",
        "seoDescription": "Meta description (120-150 chars)",
        "imageAlt": "Descriptive image alt text",
        "faq": [
          {"q": "Frequently asked question 1?", "a": "Clear answer to question 1."},
          {"q": "Frequently asked question 2?", "a": "Clear answer to question 2."}
        ],
        "sources": [
          {"name": "Source Name 1", "url": "https://example.com/source1"},
          {"name": "Source Name 2", "url": "https://example.com/source2"}
        ]
      }`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        const rawText = response.text ? response.text.trim() : '';
        const cleanJsonText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        const data = JSON.parse(cleanJsonText);

        if (data.body) body = data.body;
        if (data.excerpt) excerpt = data.excerpt;
        if (data.seoTitle) seoTitle = data.seoTitle;
        if (data.seoDescription) seoDescription = data.seoDescription;
        if (data.imageAlt) imageAlt = data.imageAlt;
        if (data.faq) faq = data.faq;
        if (data.sources) sources = data.sources;
        
        console.log('Successfully generated article via Gemini API!');
      } catch (aiErr) {
        console.warn('Gemini API call failed, falling back to structured template:', aiErr.message);
      }
    }

    // Standard structured template fallback if API key is not present or API call fails
    if (!body) {
      body = `
        <h2>Introduction</h2>
        <p>In today's fast-paced world, understanding <strong>${topic.title}</strong> is more critical than ever. Whether you are a seasoned expert or just beginning to explore the subject, staying informed helps you navigate options available and make better decisions.</p>
        
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
        <p>Executing on these guidelines will help optimize your overall roadmap. Make sure to define realistic milestones, track progress weekly, and iterate based on metrics and feedback.</p>
        
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

      faq = [
        { q: `What is the primary takeaway of ${topic.title}?`, a: "The article highlights setting correct foundations and executing structured steps." },
        { q: "Is this approach suitable for beginners?", a: "Yes, it is structured to guide beginners and offer value to professionals." }
      ];

      sources = [
        { name: "Industry Association Review", url: "https://example.com/industry-review" },
        { name: "Academic Research Hub", url: "https://example.com/research-hub" }
      ];
    }

    const finalImageUrl = '/images/placeholder.webp';

    await db.run(
      `INSERT INTO articles (title, slug, excerpt, body, category, tags, author_id, featured_image, status, seo_title, seo_description, image_alt, sources, faq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        topic.title,
        slug,
        excerpt,
        body,
        topic.category,
        'automation,ai-generated',
        randomAuthor ? randomAuthor.id : 1,
        finalImageUrl,
        'draft',
        seoTitle,
        seoDescription,
        imageAlt,
        JSON.stringify(sources),
        JSON.stringify(faq)
      ]
    );

    await db.run('UPDATE topics SET status = ? WHERE id = ?', ['ready_for_review', topicId]);
    await db.run('INSERT INTO logs (level, message) VALUES (?, ?)', ['info', `Generated article draft: ${topic.title}`]);
    console.log(`Finished content generation for: ${topic.title}`);
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
  generateArticleFromTopic
};
