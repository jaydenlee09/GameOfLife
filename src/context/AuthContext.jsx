import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';

const AuthContext = createContext(null);

const provider = new GoogleAuthProvider();

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUser(u ?? null));
    return unsub;
  }, []);

  const signInWithGoogle = () => signInWithPopup(auth, provider);
  const signOut = () => firebaseSignOut(auth);

  return (
    <AuthContext.Provider value={{ firebaseUser, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
