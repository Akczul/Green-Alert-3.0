import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { loginUser, registerUser, getPerfil, oauthGoogle, oauthFacebook, logoutUser } from '../services/api';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const logoutPending = useRef(null);

  // Valida el token contra el backend al montar
  useEffect(() => {
    const token = localStorage.getItem('ga_token');
    if (!token) { setLoading(false); return; }

    getPerfil()
      .then(({ data }) => {
        setUser(data.data.user);
        localStorage.setItem('ga_user', JSON.stringify(data.data.user));
      })
      .catch(() => {
        localStorage.removeItem('ga_token');
        localStorage.removeItem('ga_refresh_token');
        localStorage.removeItem('ga_user');
      })
      .finally(() => setLoading(false));
  }, []);

  // Escucha el evento de sesión expirada despachado por api.js
  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      showToast(
        'Tu sesión ha expirado. Inicia sesión nuevamente.',
        'error',
        6000,
        { position: 'top-center' }
      );
    };
    window.addEventListener('ga:session-expired', handleExpired);
    return () => window.removeEventListener('ga:session-expired', handleExpired);
  }, [showToast]);

  const login = async (email, password, totp) => {
    const res = await loginUser(email, password, totp);
    const { token, refreshToken, user: userData } = res.data.data;
    localStorage.setItem('ga_token', token);
    if (refreshToken) localStorage.setItem('ga_refresh_token', refreshToken);
    localStorage.setItem('ga_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const register = async (nombre, apellido, email, password, telefono) => {
    const res = await registerUser(nombre, apellido, email, password, telefono);
    const { token, refreshToken, user: userData } = res.data.data;
    localStorage.setItem('ga_token', token);
    if (refreshToken) localStorage.setItem('ga_refresh_token', refreshToken);
    localStorage.setItem('ga_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const refreshUser = async () => {
    const res = await getPerfil();
    const userData = res.data.data.user;
    localStorage.setItem('ga_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const _saveSession = (token, userData, refreshToken = null) => {
    localStorage.setItem('ga_token', token);
    if (refreshToken) localStorage.setItem('ga_refresh_token', refreshToken);
    localStorage.setItem('ga_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const loginWithGoogle = async (accessToken) => {
    const res = await oauthGoogle(accessToken);
    const { token, refreshToken, user: userData } = res.data.data;
    return _saveSession(token, userData, refreshToken);
  };

  const loginWithFacebook = async (code) => {
    const res = await oauthFacebook(code);
    const { token, refreshToken, user: userData } = res.data.data;
    return _saveSession(token, userData, refreshToken);
  };

  const logout = ({ allDevices = false } = {}) => {
    if (logoutPending.current) return logoutPending.current;
    const currentRefresh = localStorage.getItem('ga_refresh_token');
    logoutPending.current = (async () => {
      try {
        if (!currentRefresh) throw new Error('missing_refresh');
        await logoutUser(currentRefresh, { allDevices });
        // Una sesión nueva de otra pestaña no debe perder sus credenciales.
        if (localStorage.getItem('ga_refresh_token') !== currentRefresh) return false;
        localStorage.removeItem('ga_token');
        localStorage.removeItem('ga_refresh_token');
        localStorage.removeItem('ga_user');
        setUser(null);
        showToast('Sesión cerrada', 'info', 3500, { position: 'top-center', subtitle: 'Hasta pronto' });
        return true;
      } catch {
        showToast('No se pudo invalidar la sesión en el servidor. Intenta cerrar sesión nuevamente.', 'error');
        return false;
      }
    })().finally(() => { logoutPending.current = null; });
    return logoutPending.current;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, loginWithGoogle, loginWithFacebook }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
