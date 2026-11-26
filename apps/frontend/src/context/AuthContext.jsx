import { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  loginUser, registerUser, getPerfil, oauthGoogle, oauthFacebook, logoutUser, exchangeOAuthCode,
  rememberSession, hasSessionHint, forgetSession,
} from '../services/api';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const logoutPending = useRef(null);

  // Valida la sesión (cookies HttpOnly) contra el backend al montar. Solo hay pista si hubo login.
  useEffect(() => {
    if (!hasSessionHint()) { forgetSession(); setLoading(false); return; }

    getPerfil()
      .then(({ data }) => {
        setUser(data.data.user);
        rememberSession(data.data.user);
      })
      .catch(() => forgetSession())
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

  // El backend entrega los tokens en cookies; el cuerpo solo trae el usuario y la expiración.
  const _saveSession = (payload) => {
    rememberSession(payload.user, payload.accessTokenExpiresAt);
    setUser(payload.user);
    return payload.user;
  };

  const login = async (email, password, totp) => _saveSession((await loginUser(email, password, totp)).data.data);

  const register = async (nombre, apellido, email, password, telefono) =>
    _saveSession((await registerUser(nombre, apellido, email, password, telefono)).data.data);

  const refreshUser = async () => {
    const res = await getPerfil();
    const userData = res.data.data.user;
    rememberSession(userData);
    setUser(userData);
    return userData;
  };

  const loginWithGoogle = async (accessToken) => _saveSession((await oauthGoogle(accessToken)).data.data);

  const loginWithFacebook = async (code) => _saveSession((await oauthFacebook(code)).data.data);

  // Inicio federado por redirección (Google/Microsoft OIDC): canje del código de un solo uso.
  const completeOAuthCallback = async (code, totp) => _saveSession((await exchangeOAuthCode(code, totp)).data.data);

  const logout = ({ allDevices = false } = {}) => {
    if (logoutPending.current) return logoutPending.current;
    logoutPending.current = (async () => {
      try {
        if (!hasSessionHint()) throw new Error('missing_session');
        await logoutUser({ allDevices });
        forgetSession();
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
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, loginWithGoogle, loginWithFacebook, completeOAuthCallback }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
