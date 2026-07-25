import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
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
        background: 'var(--bg-base)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
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
