import { createContext, useContext, useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../services/msal';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msalConfig, setMsalConfig] = useState({ enabled: false });
  
  // MSAL hooks
  const { instance, accounts } = useMsal();

  useEffect(() => {
    // Check if MSAL is enabled on the backend
    api.get('/auth/ms-config')
      .then(res => setMsalConfig(res.data))
      .catch(() => setMsalConfig({ enabled: false }));

    // Restore cached user profile for instant render
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch {}
    }

    // Validate session cookie with the server
    api.get('/auth/me')
      .then(res => {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user } = res.data;
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const loginWithMicrosoft = async () => {
    try {
      const response = await instance.loginPopup(loginRequest);
      if (response && response.idToken) {
        // Send the MSAL ID token to our backend to establish a local session
        const res = await api.post('/auth/ms-callback', { idToken: response.idToken });
        const { user } = res.data;
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        return user;
      }
    } catch (err) {
      console.error('MSAL login failed:', err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
      if (msalConfig.enabled && accounts.length > 0) {
        await instance.logoutPopup();
      }
    } catch {
      // Ignore network errors
    }
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      loginWithMicrosoft, 
      logout, 
      loading, 
      isAdmin: user?.role === 'admin',
      isManager: user?.role === 'manager',
      msalEnabled: msalConfig.enabled 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
