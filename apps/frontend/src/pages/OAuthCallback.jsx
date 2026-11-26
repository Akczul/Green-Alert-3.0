import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const getPostLoginPath = (userData) => (
  userData?.rol === 'entidad' ? '/entidad' : '/dashboard'
);

const getOAuthCodeFromLocation = () => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  return hashParams.get('oauth_code') || queryParams.get('oauth_code') || queryParams.get('code');
};

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { completeOAuthCallback } = useAuth();
  const { showToast } = useToast();
  const called = useRef(false);
  const codeRef = useRef(null);
  // Cuentas administradoras: el código federado queda pendiente hasta validar el TOTP.
  const [mfa, setMfa] = useState({ needed: false, value: '', busy: false, error: '' });

  const finish = (userData) => {
    showToast(`Bienvenido, ${userData.nombre}.`, 'success', 5000, {
      position: 'top-center',
      subtitle: 'Sesion social completada',
    });
    navigate(getPostLoginPath(userData), { replace: true });
  };

  const submitMfa = (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(mfa.value)) { setMfa((m) => ({ ...m, error: 'Introduce los 6 dígitos del autenticador.' })); return; }
    setMfa((m) => ({ ...m, busy: true, error: '' }));
    completeOAuthCallback(codeRef.current, mfa.value)
      .then(finish)
      .catch((err) => {
        const message = err.response?.data?.message || 'Código no válido.';
        if (err.response?.status === 403 && /MFA/i.test(message)) setMfa((m) => ({ ...m, busy: false, value: '', error: 'Código incorrecto o vencido. Inténtalo de nuevo.' }));
        else { showToast(message, 'error'); navigate('/login', { replace: true }); }
      });
  };

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = getOAuthCodeFromLocation();
    codeRef.current = code;
    if (!code) {
      showToast('No fue posible completar el inicio de sesion social.', 'warning');
      navigate('/login', { replace: true });
      return;
    }

    completeOAuthCallback(code)
      .then(finish)
      .catch((err) => {
        const message = err.response?.data?.message || '';
        if (err.response?.status === 403 && /MFA/i.test(message)) { setMfa((m) => ({ ...m, needed: true })); return; }
        showToast(err.response?.data?.message || 'Error al completar la autenticacion social.', 'error');
        navigate('/login', { replace: true });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mfa.needed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <form onSubmit={submitMfa} className="w-full max-w-sm flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900/80 px-8 py-7 shadow-2xl shadow-black/40">
          <h1 className="text-base font-semibold text-gray-100">Verificación en dos pasos</h1>
          <p className="text-xs text-gray-400">Tu cuenta es administradora. Escribe el código de tu aplicación autenticadora.</p>
          <label htmlFor="mfa-code" className="text-xs text-gray-300">Código de 6 dígitos</label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
            value={mfa.value} onChange={(e) => setMfa((m) => ({ ...m, value: e.target.value.replace(/\D/g, '') }))}
            aria-invalid={Boolean(mfa.error)} aria-describedby={mfa.error ? 'mfa-error' : undefined}
            className="h-10 rounded-lg border border-gray-700 bg-gray-800 px-3 text-gray-100 tracking-widest focus:outline-none focus:border-green-500" />
          {mfa.error && <p id="mfa-error" role="alert" className="text-xs text-red-400">{mfa.error}</p>}
          <button type="submit" disabled={mfa.busy} className="btn-primary h-10 disabled:opacity-50">
            {mfa.busy ? 'Verificando…' : 'Verificar y continuar'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <motion.div
        className="flex flex-col items-center gap-4 rounded-2xl border border-gray-800 bg-gray-900/80 px-8 py-7 text-center shadow-2xl shadow-black/40"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-green-400" />
        <div>
          <p className="text-sm font-semibold text-gray-100">Completando autenticacion</p>
          <p className="mt-1 text-xs text-gray-500">Estamos validando la sesion con Green Alert.</p>
        </div>
      </motion.div>
    </div>
  );
}
