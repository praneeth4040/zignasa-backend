const Razorpay = require('razorpay');

// Support several common env var names so this works regardless of small naming differences
const key_id = process.env.RAZORPAY_KEY_ID;
const key_secret = process.env.RAZORPAY_SECRET;

if (!key_id || !key_secret) {
  // Don't throw here to avoid crashing apps that don't need Razorpay at runtime,
  // but warn loudly so it's easy to detect misconfiguration.
  console.warn('[config/razorpay] Razorpay API keys not found in environment. Expected RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (or variants). Razorpay will not be initialized.');
  module.exports = null;
} else {
  const instance = new Razorpay({
    key_id,
    key_secret,
  });
  console.log('Razorpay initialized successfully.');
  module.exports = instance;
}
