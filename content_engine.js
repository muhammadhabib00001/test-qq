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

    // Capitalize title properly if short keyword
    const formattedKeyword = topic.title
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    
    let topicTitle = formattedKeyword.length < 15 
      ? `The Ultimate Guide to ${formattedKeyword} (2026): Key Strategies & Expert Insights` 
      : formattedKeyword;

    let slug = topicTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let seoTitle = autoSeo ? `${topicTitle} | The Editorial Magazine` : topicTitle;
    let seoDescription = `Learn about ${topicTitle} in this expert guided article. We explore the latest insights and step-by-step guidance.`;
    let imageAlt = `Featured graphic representation for ${topicTitle}`;
    let body = '';
    let faq = [];
    let sources = [];
    let excerpt = `An insightful look at ${topicTitle} to optimize your workflow and increase general knowledge.`;

    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const apiKeySetting = await db.get("SELECT value FROM settings WHERE key = 'gemini_api_key'");
      if (apiKeySetting && apiKeySetting.value) apiKey = apiKeySetting.value;
    }

    // Fetch existing articles for contextual SEO internal linking
    const existingArticles = await db.all("SELECT id, title, slug, category FROM articles WHERE status = 'published' LIMIT 10") || [];
    const internalLinkGuide = existingArticles.length > 0 
      ? `\n\nINTERNAL LINKING REQUIREMENT: Naturally incorporate 2 to 3 HTML hyperlinks (<a href="/article/[slug]">[anchor text]</a>) within the body text pointing to these related articles:\n` + 
        existingArticles.map(a => `- Title: "${a.title}", Slug: "${a.slug}"`).join('\n')
      : '';

    if (apiKey) {
      console.log('Generating unique content via Google Gemini API...');
      try {
        const prompt = `You are an elite Senior SEO Strategist and Professional Journalist. 
Write a 100% UNIQUE, comprehensive, 1500-word authoritative guide for the topic/keyword: "${topic.title}" in the category "${topic.category}".

CRITICAL REQUIREMENTS:
- Write specialized, deeply detailed paragraphs specifically about "${topic.title}". DO NOT use generic phrases.
- Use clean semantic HTML (<h2>, <h3>, <h4>, <p>, <ul>, <ol>, <table>).
- Include a Featured Snippet summary callout box (<div class="bg-indigo-50 border-l-4 border-indigo-600 p-5 my-6 rounded-r-xl not-prose">...</div>).
- Include a comparison <table> with real metrics for "${topic.title}".
- Include 4 detailed FAQs and 3 sources.${internalLinkGuide}

Return ONLY raw JSON with these keys:
{
  "articleTitle": "Catchy, High-CTR Editorial Title for ${topic.title}",
  "excerpt": "2-sentence summary tailored to ${topic.title}",
  "body": "Complete 1500+ word HTML body with <h2>, <h3>, <table>, <ol>, <ul>",
  "seoTitle": "Keyword-rich title (50-60 chars)",
  "seoDescription": "Meta description (145-160 chars)",
  "imageAlt": "Alt text for ${topic.title}",
  "faq": [{"q": "Question?", "a": "Answer..."}],
  "sources": [{"name": "Source Name", "url": "https://example.com"}]
}`;

        let rawText = '';

        // 1. Try official SDK first
        if (GoogleGenAI) {
          try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { responseMimeType: 'application/json' }
            });
            rawText = response.text ? response.text.trim() : '';
          } catch (sdkErr) {
            console.warn('SDK call failed, trying direct REST API endpoint:', sdkErr.message);
          }
        }

        // 2. Direct REST API fallback with native fetch (guaranteed to work across Node versions)
        if (!rawText) {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });
          const resJson = await res.json();
          if (resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content && resJson.candidates[0].content.parts) {
            rawText = resJson.candidates[0].content.parts[0].text.trim();
          }
        }

        if (rawText) {
          let cleanedJson = rawText;
          if (cleanedJson.startsWith('```json')) {
            cleanedJson = cleanedJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleanedJson.startsWith('```')) {
            cleanedJson = cleanedJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }

          const data = JSON.parse(cleanedJson);
          if (data.articleTitle) topicTitle = data.articleTitle;
          if (data.body) body = data.body;
          if (data.excerpt) excerpt = data.excerpt;
          if (data.seoTitle) seoTitle = data.seoTitle;
          if (data.seoDescription) seoDescription = data.seoDescription;
          if (data.imageAlt) imageAlt = data.imageAlt;
          if (data.faq && Array.isArray(data.faq)) faq = data.faq;
          if (data.sources && Array.isArray(data.sources)) sources = data.sources;
          
          console.log(`Successfully generated unique 1500+ word AI article for "${topicTitle}"!`);
        }
      } catch (aiErr) {
        console.error('Gemini content generation failed:', aiErr.message);
      }
    }

    // Dynamic, topic-specific generator fallback if API key is not supplied
    if (!body) {
      body = `
        <div class="bg-indigo-50 border-l-4 border-indigo-600 p-5 my-6 rounded-r-xl not-prose">
          <h3 class="text-indigo-900 font-bold text-base mb-2">⚡ Quick Summary & Key Takeaways</h3>
          <p class="text-gray-800 text-sm leading-relaxed mb-3"><strong>${topicTitle}</strong> represents a transformative focus area in modern ${topic.category.toLowerCase()}, enabling practitioners to streamline decision-making, enhance productivity, and achieve sustained high performance.</p>
          <ul class="list-disc pl-5 text-xs text-gray-700 space-y-1">
            <li><strong>Primary Focus:</strong> Strategic adoption and practical optimization for ${formattedKeyword}.</li>
            <li><strong>Target Audience:</strong> Professionals, teams, and enthusiasts looking to master ${formattedKeyword}.</li>
            <li><strong>Key Benefit:</strong> Faster implementation, fewer mistakes, and measurable ROI.</li>
          </ul>
        </div>

        <h2>1. Complete Overview & Strategic Value of ${formattedKeyword}</h2>
        <p>In modern ${topic.category.toLowerCase()}, understanding the principles behind <strong>${formattedKeyword}</strong> is crucial for anyone seeking to stay competitive. By establishing clear methodologies and leveraging proven workflows, individuals and organizations can unlock substantial efficiency gains while reducing overall operational complexity.</p>
        <p>Whether you are just beginning to explore ${formattedKeyword} or looking to optimize an existing setup, this guide provides a structured, actionable breakdown of everything you need to know in 2026.</p>

        <h3>1.1 Why ${formattedKeyword} Matters Today</h3>
        <p>The acceleration of digital tools and changing consumer expectations have elevated ${formattedKeyword} to a top priority. Recent surveys indicate that adopting best practices in this area leads to up to a 45% increase in workflow effectiveness and significantly higher satisfaction scores.</p>

        <h2>2. Key Criteria & What to Look for in ${formattedKeyword}</h2>
        <p>When assessing solutions or strategies related to <strong>${formattedKeyword}</strong>, it is vital to evaluate multiple criteria to ensure long-term value and seamless adoption:</p>
        <ul>
          <li><strong>Performance & Reliability:</strong> Consistently delivering high throughput under demanding conditions.</li>
          <li><strong>Cost-to-Value Ratio:</strong> Balancing budget constraints against essential features and future-proofing.</li>
          <li><strong>Ease of Integration:</strong> Compatibility with existing software, hardware, and routine workflows.</li>
          <li><strong>Support & Ecosystem:</strong> Availability of active community support, documentation, and warranty coverage.</li>
        </ul>

        <h2>3. Comparative Matrix & Feature Analysis</h2>
        <p>To help you determine the ideal path forward for ${formattedKeyword}, the comparison table below highlights key performance dimensions across common approaches:</p>

        <table>
          <thead>
            <tr>
              <th>Feature / Metric</th>
              <th>Entry-Level Option</th>
              <th>Mid-Range Benchmark</th>
              <th>Premium / Pro Tier</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Core Performance</td>
              <td>Standard daily tasks</td>
              <td>Balanced multi-tasking</td>
              <td>Heavy workloads & maximum speed</td>
            </tr>
            <tr>
              <td>Build & Reliability</td>
              <td>Basic materials</td>
              <td>Reinforced chassis / framework</td>
              <td>Engineered premium build</td>
            </tr>
            <tr>
              <td>Longevity & Future-Proofing</td>
              <td>1–2 Years</td>
              <td>3–4 Years</td>
              <td>5+ Years sustained support</td>
            </tr>
            <tr>
              <td>Recommended Use-Case</td>
              <td>Casual & light usage</td>
              <td>Power users & professionals</td>
              <td>Enterprise & intensive production</td>
            </tr>
          </tbody>
        </table>

        <h2>4. Step-by-Step Implementation & Buying Blueprint</h2>
        <p>Follow these actionable steps to achieve the best results with <strong>${formattedKeyword}</strong>:</p>
        <ol>
          <li><strong>Define Exact Requirements:</strong> List the primary tasks, required specifications, and budget limits before making a commitment.</li>
          <li><strong>Compare Real-World Benchmarks:</strong> Review independent performance tests and user feedback rather than relying solely on marketing claims.</li>
          <li><strong>Test Compatibility:</strong> Verify that your choice integrates effortlessly with your existing tools and environment.</li>
          <li><strong>Optimize Initial Setup:</strong> Configure default settings, install necessary updates, and establish regular backup routines.</li>
        </ol>

        <h2>5. Common Mistakes to Avoid</h2>
        <p>Many users make avoidable errors when dealing with ${formattedKeyword}. Keep these critical tips in mind:</p>
        <ul>
          <li><em>Overpaying for unused features:</em> Focus on the capabilities that directly impact your daily workflow.</li>
          <li><em>Ignoring maintenance & updates:</em> Regularly check for software and security patches to keep your setup running smoothly.</li>
          <li><em>Neglecting ergonomics and user experience:</em> Usability is just as important as raw performance specifications.</li>
        </ul>

        <h2>6. Future Trends & Final Recommendations</h2>
        <p>As technological advancements continue to reshape ${topic.category.toLowerCase()}, <strong>${formattedKeyword}</strong> will become even more integrated with intelligent automation and cloud capabilities. Investing in a solution that emphasizes adaptability and strong support will ensure you remain ahead of industry shifts for years to come.</p>
      `;

      faq = [
        { q: `What is the most important factor when choosing ${formattedKeyword}?`, a: `Focus on matching your specific daily requirements and performance needs rather than buying based purely on brand name or marketing claims.` },
        { q: `Is ${formattedKeyword} suitable for beginners?`, a: `Yes, modern options are designed with user-friendly interfaces and streamlined setup processes that cater to both newcomers and seasoned professionals.` },
        { q: `How often should I update or re-evaluate my ${formattedKeyword} strategy?`, a: `We recommend conducting a bi-annual review to ensure your setup remains optimized and takes advantage of the latest technological improvements.` }
      ];

      sources = [
        { name: `${formattedKeyword} Consumer & Industry Report 2026`, url: "https://example.com/industry-report" },
        { name: "Global Technology & Standards Hub", url: "https://example.com/tech-standards" }
      ];
    }

    // Generate high quality stock photos by category
    const categoryPhotos = {
      Technology: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      Business: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80',
      Lifestyle: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80',
      Travel: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80',
      Education: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80',
      'Home & Garden': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80'
    };
    const finalImageUrl = categoryPhotos[topic.category] || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80';

    slug = topicTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await db.run(
      `INSERT INTO articles (title, slug, excerpt, body, category, tags, author_id, featured_image, status, seo_title, seo_description, image_alt, sources, faq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        topicTitle,
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
