import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import AuthGate from './components/AuthGate.jsx'

function AppShell() {
  const { firebaseUser } = useAuth();

  if (firebaseUser === undefined) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f0f1a',
        color: '#94a3b8',
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: '15px',
      }}>
        Loading…
      </div>
    );
  }

  if (firebaseUser === null) {
    return <AuthGate />;
  }

  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  </StrictMode>,
)
