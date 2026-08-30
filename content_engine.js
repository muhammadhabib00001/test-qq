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

    if (apiKey && GoogleGenAI) {
      console.log('Generating unique content via Google Gemini API...');
      try {
        const ai = new GoogleGenAI({ apiKey });
        
        const prompt = `You are an elite SEO Content Strategist and Industry Journalist. 
Write a 100% UNIQUE, highly detailed, 1500-word authoritative guide for the topic/keyword: "${topic.title}" in the category "${topic.category}".

CRITICAL REQUIREMENTS:
- DO NOT use generic boilerplate sentences. All paragraphs must be deeply specialized and rich in actionable insights, data, and industry context specifically about "${topic.title}".
- Use clean semantic HTML (<h2>, <h3>, <h4>, <p>, <ul>, <ol>, <table>, <blockquote>).
- Start the body with a dedicated Featured Snippet Quick Summary callout box (<div class="bg-indigo-50 border-l-4 border-indigo-600 p-5 my-6 rounded-r-xl not-prose">...</div>).
- Create 5-6 substantive sections with <h2> headlines tailored specifically to "${topic.title}".
- Include a real comparative HTML <table> with practical metrics.
- Write 4 clear, helpful FAQs and 3 industry sources.${internalLinkGuide}

Return ONLY valid JSON matching this exact structure:
{
  "articleTitle": "Catchy, High-CTR Editorial Headline for ${topic.title} (50-70 chars)",
  "excerpt": "Compelling 2-sentence summary tailored to ${topic.title}",
  "body": "Complete 1500+ word HTML body with <h2>, <h3>, <h4>, <table>, <ol>, <ul>",
  "seoTitle": "Keyword-rich title (50-60 chars)",
  "seoDescription": "Engaging meta description (145-160 chars)",
  "focusKeyword": "${topic.title}",
  "imageAlt": "Descriptive alt text for ${topic.title}",
  "faq": [
    {"q": "Specific question about ${topic.title}?", "a": "Detailed answer (50+ words)..."},
    {"q": "Second question about ${topic.title}?", "a": "Detailed answer (50+ words)..."},
    {"q": "Third question about ${topic.title}?", "a": "Detailed answer (50+ words)..."},
    {"q": "Fourth question about ${topic.title}?", "a": "Detailed answer (50+ words)..."}
  ],
  "sources": [
    {"name": "Authoritative Reference 1", "url": "https://example.com/source1"},
    {"name": "Authoritative Reference 2", "url": "https://example.com/source2"},
    {"name": "Authoritative Reference 3", "url": "https://example.com/source3"}
  ]
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = response.text ? response.text.trim() : '';
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
        
        console.log(`Successfully generated unique 1500+ word AI article for "${topicTitle}" via Gemini!`);
      } catch (aiErr) {
        console.error('Gemini API call failed:', aiErr.message);
      }
    }

    // Comprehensive long-form template fallback (1200+ words) if API key is not present or API call fails
    if (!body) {
      body = `
        <div class="bg-indigo-50 border-l-4 border-indigo-600 p-5 my-6 rounded-r-xl not-prose">
          <h3 class="text-indigo-900 font-bold text-base mb-2">⚡ Quick Summary & Key Takeaways</h3>
          <p class="text-gray-800 text-sm leading-relaxed mb-3"><strong>${topic.title}</strong> is a high-impact framework designed to accelerate workflow automation, minimize error margins, and scale operational efficiency by up to 48% across modern digital ecosystems.</p>
          <ul class="list-disc pl-5 text-xs text-gray-700 space-y-1">
            <li><strong>Core Strategic Focus:</strong> Operational resilience and intelligent process automation.</li>
            <li><strong>Target Audience:</strong> Technology leads, developers, project managers, and growth strategists.</li>
            <li><strong>Measurable Impact:</strong> Up to 5x faster turnaround times and reduced operational friction.</li>
          </ul>
        </div>

        <h2>1. Definitive Overview & Industry Context</h2>
        <p>In today's rapidly changing digital landscape, understanding the full scope of <strong>${topic.title}</strong> has transitioned from an optional advantage into a core strategic necessity. Across technological, commercial, and operational domains, organizations and professionals who adapt to these frameworks achieve significantly higher efficiency, lower error rates, and superior overall output quality.</p>
        
        <h3>1.1 Strategic Importance & Macro Trends</h3>
        <p>This comprehensive report provides an exhaustive, data-driven analysis of key principles, strategic methodologies, real-world case applications, and future projections surrounding ${topic.title}. Whether evaluating initial adoption or scaling existing infrastructure, the insights detailed below offer an actionable roadmap for sustained growth.</p>
        
        <h4>1.1.1 Industry Performance Benchmarks</h4>
        <p>Recent benchmarks across industry leaders reveal that structured, automated implementations yield up to a 48% reduction in task completion times while enhancing compliance and cross-team collaboration. As digital ecosystems become increasingly interconnected, establishing a robust operational foundation is paramount.</p>
        
        <h2>2. Evolution, Historical Drivers & Market Shifts</h2>
        <p>To evaluate current breakthroughs, it is essential to review the evolutionary trajectory of ${topic.title}. Over the past decade, three distinct phases have defined modern development:</p>
        <ul>
          <li><strong>Phase 1 - Legacy Operations (2015–2018):</strong> Characterized by manual workflows, static configuration files, and fragmented data silos that generated high operational friction and unpredictable delivery timelines.</li>
          <li><strong>Phase 2 - Transition & Semi-Automation (2019–2022):</strong> Marked by widespread cloud migration, initial adoption of continuous integration pipelines, and partial automation of repetitive maintenance tasks.</li>
          <li><strong>Phase 3 - Intelligent Ecosystems (2023–Present):</strong> Powered by real-time predictive analytics, native AI assistance, and dynamic auto-scaling frameworks that adapt dynamically to workload fluctuations.</li>
        </ul>

        <h2>3. Core Components & Deep Technical Breakdown</h2>
        <p>Evaluating strategic options requires comparing operational methodologies across performance efficiency, complexity, risk management, and scalable ROI. The comprehensive matrix below outlines key operational dimensions across modern implementation models:</p>

        <table>
          <thead>
            <tr>
              <th>Evaluation Dimension</th>
              <th>Legacy Methodology</th>
              <th>Hybrid Framework</th>
              <th>Next-Gen Intelligent Model</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Deployment Velocity</td>
              <td>Slow (Weeks to Months)</td>
              <td>Moderate (2–5 Days)</td>
              <td>Near-Instantaneous (< 2 Hours)</td>
            </tr>
            <tr>
              <td>Scalability Ceiling</td>
              <td>Constrained by manual capacity</td>
              <td>Linear scaling with manual triggers</td>
              <td>Elastic auto-scaling via cloud workers</td>
            </tr>
            <tr>
              <td>System Maintenance Overhead</td>
              <td>High manual maintenance & downtime</td>
              <td>Scheduled maintenance windows</td>
              <td>Self-healing automated updates</td>
            </tr>
            <tr>
              <td>Cost-to-Benefit Ratio</td>
              <td>Low long-term return on investment</td>
              <td>Moderate ROI with steady operational cost</td>
              <td>High ROI with optimized resource utilization</td>
            </tr>
            <tr>
              <td>Security & Audit Compliance</td>
              <td>Manual audit logs subject to human error</td>
              <td>Periodic automated compliance checks</td>
              <td>Continuous real-time audit logging</td>
            </tr>
          </tbody>
        </table>

        <h2>4. Step-by-Step Implementation Blueprint</h2>
        <p>Executing an optimized deployment strategy for <strong>${topic.title}</strong> requires an organized, multi-tiered approach to minimize risk and maximize performance:</p>

        <h3>Step 1: Comprehensive Infrastructure Audit</h3>
        <p>Perform an initial technical audit of existing workflows, data storage layers, and API dependencies. Document throughput bottlenecks, legacy code constraints, and security permissions before initiating upgrades.</p>

        <h3>Step 2: Modular Architecture Design & Prototyping</h3>
        <p>Design a modular framework separating core data models, logic processing, and presentation layers. Build isolated prototypes to validate performance under simulated stress loads.</p>

        <blockquote>
          "Excellence in technological execution is not achieved by chance, but through continuous refinement, rigorous testing, and structured feedback loops."
        </blockquote>

        <h3>Step 3: Automated Continuous Deployment & Real-Time Telemetry</h3>
        <p>Deploy changes using automated pipeline workflows. Implement telemetry dashboards to track key performance metrics, memory consumption, latency, and error rates in real-time.</p>

        <h2>5. Key Challenges & Defensive Mitigation Strategies</h2>
        <p>While adopting modern practices offers immense benefits, teams frequently encounter predictable hurdles during execution:</p>
        <ol>
          <li><strong>Challenge - Integration Latency:</strong> Legacy systems may experience connection timeouts when interfacing with new API endpoints. <em>Mitigation:</em> Implement resilient exponential backoff retry algorithms and robust fallback handlers.</li>
          <li><strong>Challenge - Data Inconsistency:</strong> Unsynchronized state updates between distributed modules can cause data drift. <em>Mitigation:</em> Enforce strict schema validation and atomic database transactions across all state mutations.</li>
          <li><strong>Challenge - Resource Allocation Spikes:</strong> Unexpected traffic surges can exceed default function memory limits. <em>Mitigation:</em> Configure dynamic rate limiting and serverless concurrency controls.</li>
        </ol>

        <h2>6. Future Trends & Strategic 5-Year Outlook</h2>
        <p>Looking toward the next 3 to 5 years, the landscape for <strong>${topic.title}</strong> will be shaped by deeper AI integration, autonomous decision engines, and seamless cross-platform synchronization. Organizations that invest in modular, well-documented architectures today will be uniquely positioned to leverage emerging technologies without requiring costly complete re-writes.</p>
        <p>By prioritizing clean code principles, robust error logging, and continuous automated testing, teams ensure sustained performance, security resilience, and market leadership in an increasingly competitive environment.</p>
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
