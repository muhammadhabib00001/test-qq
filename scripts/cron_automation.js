/**
 * GitHub Actions / Automated Cron Script
 * Runs topic discovery and generates AI articles on a schedule.
 */

require('dotenv').config();
const db = require('../db');
const contentEngine = require('../content_engine');

async function runCronAutomation() {
  console.log('=== Starting Scheduled Content Generation Cron ===');
  console.log(`Execution Time: ${new Date().toISOString()}`);

  try {
    // 1. Initialize Database
    await db.initDb();

    // 2. Discover RSS Topics
    console.log('[Step 1] Discovering topics from RSS feeds...');
    const discoveredCount = await contentEngine.discoverTopics();
    console.log(`[Step 1 Complete] Discovered ${discoveredCount} topics.`);

    // 3. Find ungenerated topics
    const topicsToGenerate = await db.all("SELECT id, title FROM topics WHERE status = 'discovered' ORDER BY created_at ASC LIMIT 2") || [];
    
    if (topicsToGenerate.length === 0) {
      console.log('No pending topics found for generation.');
    } else {
      console.log(`[Step 2] Found ${topicsToGenerate.length} topics ready for AI article generation.`);

      for (const t of topicsToGenerate) {
        console.log(`Generating article for topic ID ${t.id}: "${t.title}"...`);
        const success = await contentEngine.generateArticleFromTopic(t.id);
        if (success) {
          console.log(`Successfully generated article for: "${t.title}"`);
        } else {
          console.warn(`Failed generating article for: "${t.title}"`);
        }
      }
    }

    console.log('=== Cron Automation Complete ===');
    process.exit(0);
  } catch (err) {
    console.error('Fatal Error during Cron Automation:', err);
    process.exit(1);
  }
}

runCronAutomation();
