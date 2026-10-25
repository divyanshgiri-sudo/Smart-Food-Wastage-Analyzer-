import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Inline SVG icon components ── */
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

export default function Login() {
  const { loginWithOtp, requestOtp, isAuthenticated, role, bootstrapping } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1); // 1: Email, 2: OTP
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: navigate straight to the student dashboard
  if (!bootstrapping && isAuthenticated) {
    return <Navigate to="/student/dashboard" replace />;
  }

  async function handleRequestOtp(event) {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setFormError('Please enter your VIT-AP email address.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setSuccessMsg('');

    try {
      const data = await requestOtp(trimmedEmail);
      setSuccessMsg(data?.message || 'OTP sent to your VIT-AP email address.');
      setStep(2);
    } catch (error) {
      setFormError(error.message || 'Could not send OTP. Please check your email.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    const trimmedOtp = otp.trim();

    if (!trimmedOtp || trimmedOtp.length !== 6) {
      setFormError('Please enter a 6-digit OTP.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await loginWithOtp(email.trim().toLowerCase(), trimmedOtp);
      const target = location.state?.from || '/student/dashboard';
      navigate(target, { replace: true });
    } catch (error) {
      setFormError(error.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendOtp() {
    setSubmitting(true);
    setFormError('');
    try {
      await requestOtp(email.trim().toLowerCase());
      setSuccessMsg('A new OTP has been sent to your email.');
    } catch (error) {
      setFormError(error.message || 'Failed to resend OTP.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 50%, #f0f4f8 100%)', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100" style={{
        width: '100%',
        maxWidth: '440px',
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
            Smart Mess Portal
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.35rem', textAlign: 'center' }}>
            {step === 1 ? 'Passwordless OTP Authentication' : 'Verify Your Identity'}
          </p>
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

        {/* Step 1: Request OTP */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="space-y-4 flex flex-col gap-4" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#344054' }}>
                College Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg pl-10 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  placeholder="e.g. 24bce7998@vitapstudent.ac.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError('');
                  }}
                  required
                  autoFocus
                  style={{
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
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1e3a63'; e.target.style.boxShadow = '0 0 0 3px rgba(30,58,99,0.12)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#d0d5dd'; e.target.style.boxShadow = 'none'; }}
                />
                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#8b95a6' }}>
                  <MailIcon />
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#667085', marginTop: '0.4rem', lineHeight: '1.4' }}>
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
                minHeight: '46px',
              }}
            >
              {submitting ? 'Sending OTP…' : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRightIcon />
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.875rem' }}>
              <span style={{ color: '#667085' }}>Don&apos;t have an account? </span>
              <Link to="/signup" style={{ color: '#1e3a63', fontWeight: 600, textDecoration: 'none' }}>
                Sign up
              </Link>
            </div>
          </form>
        )}

        {/* Step 2: Verify OTP */}
        {step === 2 && (
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
                  <ArrowLeftIcon /> Change Email
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#667085', marginBottom: '0.75rem', padding: '0.45rem 0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e7f0' }}>
                Sent to: <strong style={{ color: '#344054' }}>{email}</strong>
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
                    width: '100%',
                    padding: '0.7rem 1rem 0.7rem 2.6rem',
                    border: '1px solid #d0d5dd',
                    borderRadius: '10px',
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    letterSpacing: '4px',
                    background: '#fff',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    outline: 'none',
                    color: '#1d2939',
                    minHeight: '44px',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1e3a63'; e.target.style.boxShadow = '0 0 0 3px rgba(30,58,99,0.12)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#d0d5dd'; e.target.style.boxShadow = 'none'; }}
                />
                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#8b95a6' }}>
                  <KeyIcon />
                </span>
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
              {submitting ? 'Verifying…' : 'Verify & Sign In'}
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
