import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthGate() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%)',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        textAlign: 'center',
        padding: '48px 40px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px',
        backdropFilter: 'blur(12px)',
        maxWidth: '360px',
        width: '90%',
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: 26,
        }}>
          ⚔️
        </div>

        <h1 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }}>
          GameOfLife
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 32px', lineHeight: 1.6 }}>
          Your progress syncs across all devices.<br />Sign in to continue your journey.
        </p>

        <button
          onClick={handleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
            color: '#f1f5f9',
            fontSize: '15px',
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        >
          {loading ? (
            <span style={{ opacity: 0.7 }}>Signing in…</span>
          ) : (
            <>
              <GoogleLogo />
              Continue with Google
            </>
          )}
        </button>

        {error && (
          <p style={{ color: '#f87171', fontSize: '13px', marginTop: '14px' }}>{error}</p>
        )}
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
