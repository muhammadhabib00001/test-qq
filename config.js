// Check if running on serverless environment (Vercel)
const IS_VERCEL = process.env.VERCEL || process.env.NOW_BUILDER_OUT || false;

module.exports = {
  IS_VERCEL
};
