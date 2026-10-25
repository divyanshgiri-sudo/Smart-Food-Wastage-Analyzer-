import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Inline SVG icon components ── */
const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IdCardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M6 19h12"/></svg>
);
const BuildingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>
);
const MailIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
);
const KeyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>
);
const ArrowRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
);
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
);
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
);
const AlertIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
);
const LeafIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 20 7.4 22 13c-3.2.5-6.5 1-9 3-2.1 1.7-3 3.5-3 7"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
);

const HOSTEL_OPTIONS = [
  { value: 'MH-1', label: "MH-1 (Men's Hostel 1)" },
  { value: 'MH-2', label: "MH-2 (Men's Hostel 2)" },
  { value: 'MH-3', label: "MH-3 (Men's Hostel 3)" },
  { value: 'MH-4', label: "MH-4 (Men's Hostel 4)" },
  { value: 'MH-5', label: "MH-5 (Men's Hostel 5)" },
  { value: 'MH-6', label: "MH-6 (Men's Hostel 6)" },
  { value: 'MH-7', label: "MH-7 (Men's Hostel 7)" },
  { value: 'LH-1', label: "LH-1 (Ladies' Hostel 1)" },
  { value: 'LH-2', label: "LH-2 (Ladies' Hostel 2)" },
  { value: 'LH-3', label: "LH-3 (Ladies' Hostel 3)" },
  { value: 'LH-4', label: "LH-4 (Ladies' Hostel 4)" },
];

/* ── Shared inline styles ── */
const inputStyle = {
  width: '100%',
  padding: '0.7rem 1rem 0.7rem 2.6rem',
  border: '1px solid #d0d5dd',
  borderRadius: '10px',
  fontSize: '0.875rem',
  background: '#fff',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none',
  color: '#1d2939',
  minHeight: '44px',
};

const selectStyle = {
  ...inputStyle,
  height: '44px',
  appearance: 'auto',
  cursor: 'pointer',
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  marginBottom: '0.5rem',
  color: '#344054',
};

const iconWrapStyle = {
  position: 'absolute',
  left: '0.85rem',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#8b95a6',
};

function handleFocus(e) { e.target.style.borderColor = '#1e3a63'; e.target.style.boxShadow = '0 0 0 3px rgba(30,58,99,0.12)'; }
function handleBlur(e) { e.target.style.borderColor = '#d0d5dd'; e.target.style.boxShadow = 'none'; }

export default function Signup() {
  const { registerRequest, registerVerify, isAuthenticated, role, bootstrapping } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Details, 2: OTP
  const [name, setName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [hostel, setHostel] = useState('MH-1');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!bootstrapping && isAuthenticated) {
    return <Navigate to="/student/dashboard" replace />;
  }

  async function handleRequestOtp(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedRegNo = regNo.trim().toUpperCase();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setFormError('Please enter your full name.');
      return;
    }
    if (!trimmedRegNo) {
      setFormError('Please enter your Registration Number (e.g. 24BCA7612).');
      return;
    }
    const studentIdRegex = /^\d{2}[A-Za-z]{3}\d{4,5}$/;
    if (!studentIdRegex.test(trimmedRegNo)) {
      setFormError('Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).');
      return;
    }
    if (!trimmedEmail) {
      setFormError('Please enter your college email address.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setSuccessMsg('');

    try {
      const data = await registerRequest({
        name: trimmedName,
        email: trimmedEmail,
        role: 'student',
        studentId: trimmedRegNo,
        regNo: trimmedRegNo,
        hostel,
      });
      setSuccessMsg(data?.message || 'Verification code sent to your college email.');
      setStep(2);
    } catch (error) {
      setFormError(error.message || 'Could not send verification code. Please check your details.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    const trimmedOtp = otp.trim();

    if (!trimmedOtp || trimmedOtp.length !== 6) {
      setFormError('Please enter a 6-digit verification code.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await registerVerify(email.trim().toLowerCase(), trimmedOtp);
      navigate('/student/dashboard', { replace: true });
    } catch (error) {
      setFormError(error.message || 'Invalid or expired code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendOtp() {
    const trimmedRegNo = regNo.trim().toUpperCase();
    const studentIdRegex = /^\d{2}[A-Za-z]{3}\d{4,5}$/;
    if (!studentIdRegex.test(trimmedRegNo)) {
      setFormError('Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const data = await registerRequest({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'student',
        studentId: regNo.trim().toUpperCase(),
        regNo: regNo.trim().toUpperCase(),
        hostel,
      });
      setSuccessMsg('A new verification code has been sent to your email.');
    } catch (error) {
      setFormError(error.message || 'Failed to resend code.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 50%, #f0f4f8 100%)', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100" style={{
        width: '100%',
        maxWidth: '460px',
        background: '#fff',
        borderRadius: '16px',
        border: '1px solid #e2e7f0',
        boxShadow: '0 20px 60px -12px rgba(0, 0, 0, 0.12), 0 8px 20px -8px rgba(0, 0, 0, 0.08)',
        padding: '2.25rem 2rem',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0f1d33, #16294a)',
            color: '#fff',
            width: '62px',
            height: '62px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
            boxShadow: '0 4px 14px rgba(15, 29, 51, 0.3)',
          }}>
            <LeafIcon />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, textAlign: 'center', color: '#0f172a', letterSpacing: '-0.02em' }}>
            Student Registration
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.35rem', textAlign: 'center' }}>
            {step === 1 ? 'Create your Smart Mess student account' : 'Verify Your Email Address'}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <div style={{
            width: step === 1 ? '2rem' : '0.5rem',
            height: '0.3rem',
            borderRadius: '999px',
            background: step === 1 ? '#16294a' : '#d0d5dd',
            transition: 'all 0.3s ease',
          }} />
          <div style={{
            width: step === 2 ? '2rem' : '0.5rem',
            height: '0.3rem',
            borderRadius: '999px',
            background: step === 2 ? '#16294a' : '#d0d5dd',
            transition: 'all 0.3s ease',
          }} />
        </div>

        {/* Status Alerts */}
        {formError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fef2f2', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.875rem', border: '1px solid #fecaca' }}>
            <AlertIcon />
            <span>{formError}</span>
          </div>
        )}

        {successMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f0fdf4', color: '#15803d', padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.875rem', border: '1px solid #bbf7d0' }}>
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Step 1: Registration Form */}
        {step === 1 ? (
          <form onSubmit={handleRequestOtp} className="space-y-4 flex flex-col gap-4" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Full Name */}
            <div>
              <label style={labelStyle}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg pl-10 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  placeholder="e.g. Pushkar Sharma"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formError) setFormError('');
                  }}
                  autoFocus
                  required
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <span style={iconWrapStyle}><UserIcon /></span>
              </div>
            </div>

            {/* Registration Number */}
            <div>
              <label style={labelStyle}>Registration Number</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg pl-10 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  placeholder="e.g. 24BCA7612"
                  value={regNo}
                  onChange={(e) => {
                    setRegNo(e.target.value);
                    if (formError) setFormError('');
                  }}
                  required
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <span style={iconWrapStyle}><IdCardIcon /></span>
              </div>
            </div>

            {/* Hostel Block */}
            <div>
              <label style={labelStyle}>Hostel Block</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg pl-10 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  value={hostel}
                  onChange={(e) => setHostel(e.target.value)}
                  required
                  style={selectStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                >
                  {HOSTEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span style={iconWrapStyle}><BuildingIcon /></span>
              </div>
            </div>

            {/* College Email */}
            <div>
              <label style={labelStyle}>College Email Address</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg pl-10 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  placeholder="e.g. 24bca7612@vitapstudent.ac.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError('');
                  }}
                  required
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <span style={iconWrapStyle}><MailIcon /></span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#667085', marginTop: '0.35rem' }}>
                Must end with @vitapstudent.ac.in or @vitap.ac.in
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-slate-900 text-white font-semibold rounded-lg shadow-md hover:bg-slate-800 transition flex items-center justify-center gap-2"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontWeight: 600,
                fontSize: '0.9375rem',
                background: 'linear-gradient(135deg, #0f1d33, #16294a)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                transition: 'opacity 0.2s, transform 0.1s',
                boxShadow: '0 2px 8px rgba(15, 29, 51, 0.25)',
                marginTop: '0.25rem',
                minHeight: '46px',
              }}
            >
              {submitting ? 'Sending Code…' : (
                <>
                  <span>Get Verification Code</span>
                  <ArrowRightIcon />
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.875rem' }}>
              <span style={{ color: '#667085' }}>Already have an account? </span>
              <Link to="/login" style={{ color: '#1e3a63', fontWeight: 600, textDecoration: 'none' }}>
                Sign in
              </Link>
            </div>
          </form>
        ) : (
          /* Step 2: OTP Verification */
          <form onSubmit={handleVerifyOtp} className="space-y-4 flex flex-col gap-4" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#344054' }}>
                  6-Digit Verification Code
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtp('');
                    setFormError('');
                    setSuccessMsg('');
                  }}
                  style={{ background: 'none', border: 'none', color: '#1e3a63', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0, fontWeight: 500 }}
                >
                  <ArrowLeftIcon /> Change Details
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#667085', marginBottom: '0.75rem', padding: '0.45rem 0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e7f0' }}>
                <div>Sent to: <strong style={{ color: '#344054' }}>{email}</strong></div>
                <div>Hostel: <strong style={{ color: '#344054' }}>{hostel}</strong></div>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg pl-10 focus:outline-none focus:ring-2 focus:ring-slate-800 text-center font-bold tracking-widest text-lg"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setOtp(val);
                    if (formError) setFormError('');
                  }}
                  autoFocus
                  required
                  style={{
                    ...inputStyle,
                    letterSpacing: '4px',
                    fontSize: '1.125rem',
                    fontWeight: 600,
                  }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <span style={iconWrapStyle}><KeyIcon /></span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-slate-900 text-white font-semibold rounded-lg shadow-md hover:bg-slate-800 transition flex items-center justify-center gap-2"
              disabled={submitting || otp.length !== 6}
              style={{
                width: '100%',
                padding: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontWeight: 600,
                fontSize: '0.9375rem',
                background: 'linear-gradient(135deg, #0f1d33, #16294a)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                cursor: (submitting || otp.length !== 6) ? 'not-allowed' : 'pointer',
                opacity: (submitting || otp.length !== 6) ? 0.55 : 1,
                transition: 'opacity 0.2s, transform 0.1s',
                boxShadow: '0 2px 8px rgba(15, 29, 51, 0.25)',
                minHeight: '46px',
              }}
            >
              {submitting ? 'Verifying…' : 'Verify & Complete Registration'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={submitting}
                style={{ background: 'none', border: 'none', color: '#667085', fontSize: '0.8125rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem' }}
              >
                <RefreshIcon /> Didn&apos;t receive the code? Resend
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px solid #e2e7f0', paddingTop: '1rem' }}>
          VIT-AP University &bull; Smart Food Wastage Analyser
        </div>
      </div>
    </div>
  );
}
