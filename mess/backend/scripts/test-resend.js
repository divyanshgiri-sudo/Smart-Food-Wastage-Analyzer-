const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { sendOtpEmail } = require('../otpService');

// Accept your Resend account email as a command-line argument
const targetEmail = process.argv[2];

if (!targetEmail || !targetEmail.includes('@')) {
  console.error('\nUsage: node mess/backend/scripts/test-resend.js <your-resend-registered-email>\n');
  process.exit(1);
}

if (!process.env.RESEND_API_KEY) {
  console.error('\nError: RESEND_API_KEY is not set in environment or in mess/backend/.env\n');
  process.exit(1);
}

(async () => {
  console.log(`\nAttempting to send test OTP email via Resend to: ${targetEmail}`);
  try {
    // Generate a test 6-digit code without printing it to the console
    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    await sendOtpEmail(targetEmail, testOtp);
    console.log('✓ SUCCESS: Email accepted by Resend API! Check your inbox.\n');
  } catch (err) {
    console.error('✗ FAILED: Resend API returned an error:');
    console.error(err.message || err);
    console.log();
    process.exit(1);
  }
})();
