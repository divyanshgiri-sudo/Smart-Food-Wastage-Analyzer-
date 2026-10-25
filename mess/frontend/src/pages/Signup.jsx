import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChefHat, Mail, KeyRound, ArrowRight, ArrowLeft, RefreshCw, AlertCircle, Building2, User } from 'lucide-react';

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

export default function Signup() {
  const [step, setStep] = useState(1); // 1: Details, 2: OTP
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [hostel, setHostel] = useState('MH-1');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { registerRequest, registerVerify } = useAuth();
  const navigate = useNavigate();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }
    if (!trimmedEmail) {
      setError('Please enter your college email address.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    const result = await registerRequest({
      name: trimmedName,
      email: trimmedEmail,
      role: 'admin',
      hostel,
    });
    setLoading(false);

    if (result.success) {
      setSuccessMsg(result.message || 'Verification code sent to your email.');
      setStep(2);
    } else {
      setError(result.message || 'Registration failed. Please check your email.');
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

    const result = await registerVerify(email.trim().toLowerCase(), trimmedOtp);
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
    const result = await registerRequest({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'admin',
      hostel,
    });
    setLoading(false);
    if (result.success) {
      setSuccessMsg('A new verification code has been sent to your email.');
    } else {
      setError(result.message || 'Failed to resend code.');
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
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, textAlign: 'center' }}>Mess Administrator Sign Up</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem', textAlign: 'center' }}>
            {step === 1 ? 'Register as a Mess Administrator' : 'Verify Your Email'}
          </p>
        </div>

        {/* Alerts */}
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

        {/* Step 1: Registration Form */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-color)' }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Rajesh Kumar"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError('');
                  }}
                  required
                  autoFocus
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                />
                <User size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-color)' }}>
                College Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="e.g. rajesh.admin@vitap.ac.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  required
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                />
                <Mail size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                Must end with @vitapstudent.ac.in or @vitap.ac.in
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-color)' }}>
                Assigned Hostel Mess
              </label>
              <div style={{ position: 'relative' }}>
                <select 
                  className="input-field" 
                  value={hostel}
                  onChange={(e) => setHostel(e.target.value)}
                  style={{ width: '100%', paddingLeft: '2.5rem', height: '42px', appearance: 'auto' }}
                  required
                >
                  {HOSTEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Building2 size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading} 
              style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600, marginTop: '0.5rem' }}
            >
              {loading ? 'Sending Code...' : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Already have an account? </span>
              <Link to="/login" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>
                Sign in
              </Link>
            </div>
          </form>
        )}

        {/* Step 2: Verification Form */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-color)' }}>
                  Enter 6-Digit Code
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
                  <ArrowLeft size={14} /> Change details
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--bg-color)', borderRadius: '4px' }}>
                <div>Sent to: <strong>{email}</strong></div>
                <div>Hostel: <strong>{hostel}</strong></div>
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
              {loading ? 'Verifying...' : 'Verify & Complete Registration'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8125rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RefreshCw size={14} /> Didn&apos;t receive code? Resend
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
