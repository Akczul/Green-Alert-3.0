import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MapPin, Users, BarChart2, Bell, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useGoogleLogin } from '@react-oauth/google';
import NebulaBackground from '../components/NebulaBackground';
import { getMicrosoftAuthUrl } from '../services/api';

const getPostLoginPath = (userData, fallback = '/dashboard') => (
  userData?.rol === 'entidad' && fallback === '/dashboard' ? '/entidad' : fallback
);

const features = [
  { Icon: MapPin,    text: 'Geolocalización precisa' },
  { Icon: Users,     text: 'Participación colectiva' },
  { Icon: BarChart2, text: 'Visualización en mapa' },
  { Icon: Bell,      text: 'Alertas tempranas' },
];

// Variantes de animación
const panelVariants = {
  hidden: (x) => ({ opacity: 0, x }),
  show:   { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  show:   (i) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.28 + i * 0.08, duration: 0.32, ease: 'easeOut' },
  }),
};

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleGoogleSuccess = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setOauthLoading('google');
      try {
        const userData = await loginWithGoogle(tokenResponse.access_token);
        showToast(`¡Bienvenido, ${userData.nombre}!`, 'success', 5000, {
          position: 'top-center', subtitle: 'Has iniciado sesión con Google',
        });
        navigate(getPostLoginPath(userData, from), { replace: true });
      } catch (err) {
        showToast(err.response?.data?.message || 'Error al iniciar sesión con Google.', 'error');
      } finally {
        setOauthLoading('');
      }
    },
    onError: () => showToast('Inicio de sesión con Google cancelado.', 'warning'),
    flow: 'implicit',
  });

  // OpenID Connect con Microsoft Entra ID: el backend genera state, nonce y PKCE; aquí solo se redirige.
  const handleMicrosoft = async () => {
    setOauthLoading('microsoft');
    try {
      const { data } = await getMicrosoftAuthUrl();
      window.location.assign(data.data.url);
    } catch (err) {
      showToast(err.response?.data?.message || 'Inicio de sesión con Microsoft no disponible.', 'error');
      setOauthLoading(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userData = await login(form.email, form.password);
      showToast(`¡Bienvenido, ${userData.nombre}!`, 'success', 5000, {
        position: 'top-center',
        subtitle: 'Has iniciado sesión correctamente',
      });
      navigate(getPostLoginPath(userData, from), { replace: true });
    } catch (err) {
      showToast(err.response?.data?.message || 'Correo o contraseña incorrectos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex overflow-hidden">

      {/* ── Panel izquierdo (solo Desktop lg+) ── */}
      <motion.div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative bg-gray-900 flex-col items-center justify-center p-12 border-r border-gray-800"
        custom={-32}
        variants={panelVariants}
        initial="hidden"
        animate="show"
      >
        <NebulaBackground compact dim />

        <div className="relative z-10 text-center max-w-sm">
          <img src="/chrome-512x512.webp" alt="GreenAlert" className="h-36 w-auto object-contain mx-auto mb-4 drop-shadow-2xl" loading="lazy" />
          <h2 className="text-2xl font-bold mb-1">
            <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
              GreenAlert
            </span>
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-10">
            Plataforma ciudadana para el monitoreo y reporte de problemáticas ambientales en tu territorio.
          </p>
          <div className="grid grid-cols-2 gap-3 text-left">
            {features.map(({ Icon, text }, i) => (
              <motion.div
                key={text}
                custom={i}
                variants={fieldVariants}
                initial="hidden"
                animate="show"
                className="flex items-center gap-2 bg-gray-800/70 border border-gray-700/50 rounded-xl px-3 py-2.5"
              >
                <Icon className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-gray-300 text-xs">{text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Panel derecho (formulario) ── */}
      <motion.div
        className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12"
        custom={32}
        variants={panelVariants}
        initial="hidden"
        animate="show"
      >
        <div className="w-full max-w-md">

          {/* Logo visible solo en mobile/tablet */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link to="/">
              <img src="/chrome-512x512.webp" alt="GreenAlert" className="h-16 w-auto object-contain" loading="lazy" />
            </Link>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/40">

            <motion.div
              className="mb-7"
              custom={0}
              variants={fieldVariants}
              initial="hidden"
              animate="show"
            >
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                Bienvenido de{' '}
                <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                  vuelta
                </span>
              </h2>
              <p className="text-gray-400 text-sm">Ingresa tus credenciales para continuar</p>
            </motion.div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full bg-gray-800/80 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition"
                />
              </motion.div>

              {/* Contraseña */}
              <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-300">Contraseña</label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-green-400 hover:text-green-300 transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-800/80 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-2.5 pr-11 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition p-0.5"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </motion.div>

              <motion.div custom={3} variants={fieldVariants} initial="hidden" animate="show">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed h-11"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Iniciando sesión...
                    </span>
                  ) : 'Iniciar sesión'}
                </button>
              </motion.div>
            </form>

            {/* ── OAuth ── */}
            <motion.div custom={4} variants={fieldVariants} initial="hidden" animate="show" className="mt-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-500">o continúa con</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Google */}
                <button
                  type="button"
                  onClick={() => handleGoogleSuccess()}
                  disabled={!!oauthLoading}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl border border-gray-700 bg-gray-800/60 hover:bg-gray-800 text-gray-300 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {oauthLoading === 'google' ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  )}
                  Google
                </button>
                {/* Microsoft (OIDC) */}
                <button
                  type="button"
                  onClick={handleMicrosoft}
                  disabled={!!oauthLoading}
                  aria-label="Continuar con Microsoft"
                  className="flex items-center justify-center gap-2 h-10 rounded-xl border border-gray-700 bg-gray-800/60 hover:bg-gray-800 text-gray-300 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {oauthLoading === 'microsoft' ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 23 23" aria-hidden="true"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>
                  )}
                  Microsoft
                </button>
              </div>
            </motion.div>

            <motion.p
              custom={5}
              variants={fieldVariants}
              initial="hidden"
              animate="show"
              className="mt-6 text-center text-sm text-gray-400"
            >
              ¿No tienes cuenta?{' '}
              <Link to="/register" className="text-green-400 hover:text-green-300 font-medium transition-colors">
                Regístrate gratis
              </Link>
            </motion.p>
          </div>

          <p className="mt-4 text-center text-xs text-gray-600">
            <Link to="/" className="hover:text-gray-400 transition-colors">← Volver al inicio</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

