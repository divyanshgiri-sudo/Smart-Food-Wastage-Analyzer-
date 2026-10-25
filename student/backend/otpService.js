require('dotenv').config();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vitap-smart-mess-jwt-secret-key-2026';
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// In-memory store: Map<email, { otp, expiresAt }>
const otpStore = new Map();

function isVitapEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith('@vitapstudent.ac.in') || normalized.endsWith('@vitap.ac.in');
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Initialize Google OAuth2 client using GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
);

const initialCredentials = {};
if (process.env.GMAIL_REFRESH_TOKEN) initialCredentials.refresh_token = process.env.GMAIL_REFRESH_TOKEN;
if (process.env.GMAIL_ACCESS_TOKEN) initialCredentials.access_token = process.env.GMAIL_ACCESS_TOKEN;
if (Object.keys(initialCredentials).length > 0) {
  oAuth2Client.setCredentials(initialCredentials);
}

const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

async function sendOtpEmail(email, otp) {
  const missingKeys = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter(
    (key) => !process.env[key]
  );
  if (missingKeys.length > 0) {
    console.error(`[AUTH] Missing Gmail OAuth2 configuration: ${missingKeys.join(', ')}`);
  }

  // Ensure latest credentials are bound to oAuth2Client
  const currentCredentials = {};
  if (process.env.GMAIL_REFRESH_TOKEN) currentCredentials.refresh_token = process.env.GMAIL_REFRESH_TOKEN;
  if (process.env.GMAIL_ACCESS_TOKEN) currentCredentials.access_token = process.env.GMAIL_ACCESS_TOKEN;
  if (Object.keys(currentCredentials).length > 0) {
    oAuth2Client.setCredentials(currentCredentials);
  }

  const senderEmail = process.env.GMAIL_USER || 'vitap.smartmess@gmail.com';
  const fromAddress = process.env.EMAIL_FROM || `"VIT-AP Smart Mess" <${senderEmail}>`;
  const subject = 'VIT-AP Smart Mess — Login Verification Code';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #1e293b; margin-top: 0;">Smart Mess Login Verification</h2>
      <p style="color: #475569; font-size: 15px;">Your one-time login verification code for VIT-AP Smart Mess is:</p>
      <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4f46e5;">${otp}</span>
      </div>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">This OTP will expire in 5 minutes. If you did not request this OTP, you can safely ignore this email.</p>
    </div>
  `;

  // Construct RFC 2822 email message
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `From: ${fromAddress}`,
    `To: ${email}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html.trim(),
  ];
  const rawEmail = messageParts.join('\r\n');

  // Base64url encode the raw email string
  const encodedMessage = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`[AUTH] OTP email sent to ${email} via Gmail API (messageId: ${res.data?.id || 'mock'})`);
    return res.data;
  } catch (err) {
    console.error(`[AUTH] Could not send email via Gmail API: ${err.message}`);
  }
  console.log(`[AUTH] >>> OTP for ${email}: ${otp} (valid for 5 mins) <<<`);
}

function storeOtp(email, otp) {
  const normalized = email.trim().toLowerCase();
  otpStore.set(normalized, {
    otp: String(otp).trim(),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  });
}

function verifyOtp(email, otp) {
  const normalized = String(email || '').trim().toLowerCase();
  const candidate = String(otp || '').trim();

  const record = otpStore.get(normalized);
  if (!record) {
    return { valid: false, error: 'No OTP requested for this email or OTP expired.' };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalized);
    return { valid: false, error: 'OTP has expired. Please request a new one.' };
  }

  if (record.otp !== candidate) {
    return { valid: false, error: 'Invalid OTP. Please check and try again.' };
  }

  otpStore.delete(normalized);
  return { valid: true };
}

function determineRole(email, requestedRole, defaultRole = 'student') {
  return 'student';
}

function issueToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

const pendingRegistrations = new Map();

function storePendingRegistration(email, data) {
  const normalized = email.trim().toLowerCase();
  pendingRegistrations.set(normalized, {
    ...data,
    email: normalized,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  });
}

function getPendingRegistration(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const record = pendingRegistrations.get(normalized);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    pendingRegistrations.delete(normalized);
    return null;
  }
  return record;
}

function clearPendingRegistration(email) {
  const normalized = String(email || '').trim().toLowerCase();
  pendingRegistrations.delete(normalized);
}

function getStoredOtp(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const record = otpStore.get(normalized);
  if (!record || Date.now() > record.expiresAt) return null;
  return record.otp;
}

module.exports = {
  JWT_SECRET,
  isVitapEmail,
  generateOtp,
  sendOtpEmail,
  storeOtp,
  verifyOtp,
  getStoredOtp,
  determineRole,
  issueToken,
  verifyToken,
  storePendingRegistration,
  getPendingRegistration,
  clearPendingRegistration,
};
