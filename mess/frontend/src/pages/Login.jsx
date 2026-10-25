import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChefHat, Mail, KeyRound, ArrowRight, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';

export default function Login() {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError('Please enter your VIT-AP email address.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    const result = await requestOtp(trimmedEmail);
    setLoading(false);

    if (result.success) {
      setSuccessMsg(result.message || 'OTP sent successfully to your college email.');
      setStep(2);
    } else {
      setError(result.message || 'Failed to request OTP. Please verify your email.');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const trimmedOtp = otp.trim();

    if (!trimmedOtp || trimmedOtp.length !== 6) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }

    setLoading(true);
    setError('');

    const result = await verifyOtp(email.trim().toLowerCase(), trimmedOtp);
    setLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Verification failed. Please check the OTP and try again.');
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setError('');
    const result = await requestOtp(email.trim().toLowerCase());
    setLoading(false);
    if (result.success) {
      setSuccessMsg('A new OTP has been sent to your email.');
    } else {
      setError(result.message || 'Failed to resend OTP.');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-color)', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '2rem', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.75rem' }}>
          <div style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '0.875rem', borderRadius: '50%', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChefHat size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, textAlign: 'center' }}>Mess Administrator Portal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem', textAlign: 'center' }}>
            Passwordless OTP Authentication
          </p>
        </div>

        {/* Status Alerts */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--danger-bg, #fee2e2)', color: 'var(--danger-color, #dc2626)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md, 6px)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#dcfce7', color: '#15803d', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md, 6px)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Step 1: Request OTP */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-color)' }}>
                College Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="e.g. mess.admin@vitap.ac.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  required
                  autoFocus
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                />
                <Mail size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.3' }}>
                Must end with @vitapstudent.ac.in or @vitap.ac.in
              </p>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading} 
              style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
            >
              {loading ? 'Sending OTP...' : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Don&apos;t have an account? </span>
              <Link to="/signup" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>
                Sign up
              </Link>
            </div>
          </form>
        )}

        {/* Step 2: Verify OTP */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-color)' }}>
                  Enter 6-Digit OTP
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtp('');
                    setError('');
                    setSuccessMsg('');
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0 }}
                >
                  <ArrowLeft size={14} /> Change Email
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', padding: '0.4rem 0.6rem', backgroundColor: 'var(--bg-color)', borderRadius: '4px' }}>
                Sent to: <strong>{email}</strong>
              </div>

              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setOtp(val);
                    if (error) setError('');
                  }}
                  required
                  autoFocus
                  style={{ width: '100%', paddingLeft: '2.5rem', letterSpacing: '4px', fontSize: '1.125rem', fontWeight: 600 }}
                />
                <KeyRound size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || otp.length !== 6} 
              style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
            >
              {loading ? 'Verifying...' : 'Verify OTP & Sign In'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8125rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RefreshCw size={14} /> Didn&apos;t receive OTP? Resend
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          VIT-AP University &bull; Smart Food Wastage Analyser
        </div>
      </div>
    </div>
  );
}
