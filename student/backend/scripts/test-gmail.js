const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { sendOtpEmail } = require('../otpService');

// Accept target email as a command-line argument
const targetEmail = process.argv[2];

if (!targetEmail || !targetEmail.includes('@')) {
  console.error('\nUsage: node student/backend/scripts/test-gmail.js <target-email>\n');
  process.exit(1);
}

const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`\nError: Missing required Google OAuth environment variable(s): ${missing.join(', ')}\n`);
  process.exit(1);
}

(async () => {
  console.log(`\nAttempting to send test OTP email via Gmail API to: ${targetEmail}`);
  try {
    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const result = await sendOtpEmail(targetEmail, testOtp);
    if (result && result.id) {
      console.log(`✓ SUCCESS: Email accepted by Gmail API! (messageId: ${result.id})\n`);
    } else {
      console.log('✓ Completed dispatch attempt.\n');
    }
  } catch (err) {
    console.error('✗ FAILED: Gmail API returned an error:', err.message || err);
    process.exit(1);
  }
})();
