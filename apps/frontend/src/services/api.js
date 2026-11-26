import axios from 'axios';

// Sesión web por cookies HttpOnly/Secure/SameSite=Strict emitidas por el backend: JavaScript nunca
// lee ni guarda tokens. Solo se conservan datos no secretos: perfil (pista de sesión) y expiración.
const WEB_CLIENT = { 'X-GreenAlert-Client': 'web' };
const api = axios.create({
  baseURL: '/api',
  timeout: 8000,
  withCredentials: true,
  headers: WEB_CLIENT,
});

export const analizarRiesgoAmbiental = () => api.post('/integracion/analisis/riesgo', { dias: 30 }, { timeout: 40000 });
export const consultarIndicadoresAmbientales = () => api.get('/integracion/indicadores', { timeout: 40000 });
export const consultarHistorialAmbiental = id => api.get(`/integracion/reportes/${id}/historial`, { timeout: 40000 });

const SESSION_HINT = 'ga_user';
const ACCESS_EXP = 'ga_access_exp';
const UNSAFE = new Set(['post', 'put', 'patch', 'delete']);

// Token anti-CSRF de doble envío: la cookie __Host-ga_csrf es legible a propósito; las de sesión no.
export const csrfHeader = () => {
  const cookie = typeof document === 'undefined' ? '' : document.cookie;
  const raw = cookie.split('; ').find((c) => c.startsWith('__Host-ga_csrf='))?.slice('__Host-ga_csrf='.length);
  return raw ? { 'X-CSRF-Token': decodeURIComponent(raw) } : {};
};

export const rememberSession = (user, accessTokenExpiresAt) => {
  localStorage.setItem(SESSION_HINT, JSON.stringify(user));
  if (accessTokenExpiresAt) localStorage.setItem(ACCESS_EXP, accessTokenExpiresAt);
};
export const hasSessionHint = () => Boolean(localStorage.getItem(SESSION_HINT));
export const forgetSession = () => {
  // Incluye claves de versiones anteriores que guardaban tokens en localStorage.
  for (const key of [SESSION_HINT, ACCESS_EXP, 'ga_token', 'ga_refresh_token']) localStorage.removeItem(key);
};

// ── Limpia sesión y notifica a la app ─────────────────────────────────────
const clearSession = () => {
  forgetSession();
  window.dispatchEvent(new Event('ga:session-expired'));
};

// ── Estado compartido de refresh ──────────────────────────────────────────
let authGeneration = 0;
let logoutInProgress = false;
let refreshFlight = null;
let isRefreshing = false;
let proactiveRefreshPromise = null;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  failedQueue = [];
};

// Lógica de refresh reutilizada por ambos interceptores. El refresh viaja en su cookie HttpOnly.
const doRefresh = () => {
  if (logoutInProgress) return Promise.reject(new Error('session_changed'));
  if (refreshFlight) return refreshFlight;
  if (!hasSessionHint()) return Promise.reject(new Error('no_refresh_token'));
  const generation = authGeneration;
  refreshFlight = axios
    .post(`${api.defaults.baseURL}/auth/refresh`, {}, { timeout: 8000, withCredentials: true, headers: { ...WEB_CLIENT, ...csrfHeader() } })
    .then(({ data }) => {
      if (generation !== authGeneration || !hasSessionHint()) throw new Error('session_changed');
      if (data?.data?.accessTokenExpiresAt) localStorage.setItem(ACCESS_EXP, data.data.accessTokenExpiresAt);
      return true;
    }).finally(() => { refreshFlight = null; });
  return refreshFlight;
};

// ── Request interceptor: CSRF y refresco PROACTIVO ────────────────────────
// Si el acceso expira en < 2 min, se renueva ANTES de enviar la petición.
// Esto evita fallos en uploads multipart que no se pueden reintentar.
api.interceptors.request.use(async (config) => {
  const isAuthFlow = config.url?.includes('/auth/refresh') || config.url?.includes('/auth/login');
  const expiresAt = Date.parse(localStorage.getItem(ACCESS_EXP) ?? '');
  if (!isAuthFlow && hasSessionHint() && Number.isFinite(expiresAt) && expiresAt - Date.now() < 120000) {
    try {
      if (!proactiveRefreshPromise) {
        proactiveRefreshPromise = doRefresh().finally(() => {
          proactiveRefreshPromise = null;
        });
      }
      await proactiveRefreshPromise;
    } catch {
      // Si falla el refresh proactivo, el response interceptor lo manejará
    }
  }
  // Se calcula en cada envío: la cookie CSRF rota con cada renovación.
  if (UNSAFE.has(String(config.method).toLowerCase())) Object.assign(config.headers, csrfHeader());
  return config;
});

// ── Response interceptor: refresco REACTIVO (fallback 401) ────────────────
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;

    if (
      (err.response?.status === 401 || (err.response?.status === 403 && err.response?.data?.message === 'token inválido o expirado.')) &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login')
    ) {
      if (!hasSessionHint()) {
        clearSession();
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          originalRequest._retry = true;
          return api(originalRequest);
        }).catch((e) => Promise.reject(e));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await doRefresh();
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (refreshError.message !== 'session_changed') clearSession();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export const checkHealth = () => api.get('/health');

// ── Auth ──
// El refresh viaja en la cookie HttpOnly; allDevices usa la cookie de acceso. Ambos con CSRF.
export const logoutUser = ({ allDevices = false } = {}) => {
  logoutInProgress = true;
  authGeneration++; // Impide que un refresh en vuelo restaure credenciales tras logout.
  return axios.post(`${api.defaults.baseURL}/auth/logout`, { allDevices }, { timeout: 8000, withCredentials: true, headers: { ...WEB_CLIENT, ...csrfHeader() } })
    .finally(() => { logoutInProgress = false; });
};
// totp: segundo factor de cuentas administradoras en inicio federado.
export const exchangeOAuthCode = (code, totp) => api.post('/auth/oauth/exchange', { code, ...(totp ? { totp } : {}) });

export const loginUser    = (email, password, totp)                             => api.post('/auth/login',    { email, password, ...(totp ? { totp } : {}) });
export const registerUser = (nombre, apellido, email, password, telefono)       => api.post('/auth/register', { nombre, apellido, email, password, telefono });
export const oauthGoogle        = (access_token) => api.post('/auth/google',   { access_token });
export const oauthFacebook      = (code)          => api.post('/auth/facebook', { code });
export const getGoogleAuthUrl   = ()              => api.get('/auth/google/url');
export const getFacebookAuthUrl = ()              => api.get('/auth/facebook/url');
export const getMicrosoftAuthUrl = ()             => api.get('/auth/microsoft/url');

// ── Categorías ──
export const getCategorias         = ()       => api.get('/categorias');
export const getCategoriaPorCodigo = (codigo) => api.get(`/categorias/${codigo}`);

// ── Reportes ──
export const getStats       = ()           => api.get('/reportes/stats');
// FE-20: stats analíticas
export const getStatsCategoria = ()                  => api.get('/reportes/stats/categoria');
export const getStatsTimeline  = (params)            => api.get('/reportes/stats/timeline', { params });
export const getHeatmapPoints  = ()                  => api.get('/reportes/stats/heatmap');
// FE-27 (BE-12): agregados de la IA para gráficos de tendencias
export const getStatsIA        = (params)            => api.get('/reportes/stats/ia', { params });
export const createReporte  = (data) => api.post('/reportes', data, { timeout: 60000 });
export const getReportes    = (params)     => api.get('/reportes', { params });
export const getReporteById = (id, skipView = false) =>
  api.get(`/reportes/${id}`, skipView ? { params: { skip_view: 'true' } } : {});
// FE-24 (BE-09): clasificación de imagen con IA antes de crear el reporte
export const analizarImagenIA = (file) => {
  const formData = new FormData();
  formData.append('imagen', file);
  return api.post('/reportes/analizar-imagen', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
};
// sugerencia de título y descripción basada en imágenes adjuntas
export const sugerirContenidoReporte = (formData) =>
  api.post('/reportes/sugerir-contenido', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 45000,
  });
export const updateReporte  = (id, data)   => api.patch(`/reportes/${id}`, data);
export const deleteReporte  = (id)         => api.delete(`/reportes/${id}`);
export const exportReportes = (params)     => api.get('/reportes/export', { params, responseType: 'arraybuffer' });

// Likes y tendencias
export const toggleLikeReporte  = (id)         => api.post(`/reportes/${id}/like`);
export const getTrendingReportes = (params)    => api.get('/reportes/trending', { params });

// zonas de riesgo predictivas y alertas
export const getZonasRiesgo        = (params) => api.get('/reportes/zonas-riesgo',        { params });
export const getAlertasPredictivas = (params) => api.get('/reportes/alertas-predictivas', { params });

// ── Perfil / Auth ──
export const getPerfil            = ()                                               => api.get('/auth/perfil');
export const updatePerfil         = (data)                                            => api.patch('/auth/perfil', data);
export const updateAvatar         = (formData)                                        => api.patch('/auth/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const changePassword       = (currentPassword, newPassword, confirmPassword)   => api.patch('/auth/cambiar-contrasena', { currentPassword, newPassword, confirmPassword });
export const updateNotifications  = (preferences)                                     => api.patch('/auth/notificaciones', preferences);

export const getMisReportes     = (params)                                            => api.get('/reportes/mis-reportes', { params });
export const forgotPassword     = (email)                                              => api.post('/auth/forgot-password', { email });
export const resetPasswordToken = (token, newPassword, confirmPassword)                => api.post('/auth/reset-password', { token, newPassword, confirmPassword });
export const enviarVerificacionOtp = ()                                                => api.post('/auth/enviar-verificacion');
export const verificarEmailOtp     = (codigo)                                          => api.post('/auth/verificar-email', { codigo });

// ── Admin: gestión de usuarios (solo rol admin) ──
export const getAdminStats        = ()                  => api.get('/admin/usuarios/stats');
export const getAdminUsuarios     = (params)            => api.get('/admin/usuarios', { params });
export const getAdminUsuario      = (id)                => api.get(`/admin/usuarios/${id}`);
export const cambiarRolUsuario    = (id, rol, extra = {}) => api.patch(`/admin/usuarios/${id}/rol`, { rol, ...extra });
// Solo superadministrador: bitácora de cambios administrativos (solo lectura).
export const getAdminAuditoria    = (params)            => api.get('/admin/auditoria', { params });
export const cambiarEstadoUsuario = (id, activo)        => api.patch(`/admin/usuarios/${id}/estado`, { activo });
export const eliminarUsuarioAdmin = (id)                => api.delete(`/admin/usuarios/${id}`);

// chatbot conversacional
export const sendChatMessage = (payload, options = {}) => api.post('/chatbot/mensaje', payload, { timeout: 10000, ...options });
export const getChatFaqs = () => api.get('/chatbot/faqs');

// notificaciones in-app
export const getNotificaciones                = (params)  => api.get('/notificaciones', { params });
export const getNotificacionesContador        = ()        => api.get('/notificaciones/contador');
export const marcarNotificacionLeida          = (uuid)    => api.patch(`/notificaciones/${uuid}/leida`);
export const marcarTodasNotificacionesLeidas  = ()        => api.patch('/notificaciones/marcar-todas');
export const eliminarNotificacion             = (uuid)    => api.delete(`/notificaciones/${uuid}`);

// push notifications FCM
export const registrarFcmToken = (token) => api.post('/notificaciones/fcm-token', { token });

// ── Entidades ──
export const getEntidades = () => api.get('/entidades');

// ── Moderación: asignación de reportes a entidades ──
export const asignarReporteEntidad = (idReporte, data) => api.post(`/reportes/${idReporte}/asignaciones`, data);

// ── Panel de entidad ──
export const getMisReportesEntidad             = (params)          => api.get('/entidades/mis-reportes', { params });
export const getMiReporteEntidad               = (idReporte)       => api.get(`/entidades/mis-reportes/${idReporte}`);
export const actualizarAtencionEntidad         = (idReporte, data) => api.patch(`/entidades/mis-reportes/${idReporte}/atencion`, data);
export const getMisAlertasEntidad              = (params)          => api.get('/entidades/mis-alertas', { params });
export const getMisAlertasNoLeidasCountEntidad = ()                => api.get('/entidades/mis-alertas/no-leidas/count');
export const marcarAlertaEntidadLeida          = (idAlerta)        => api.patch(`/entidades/mis-alertas/${idAlerta}/leer`);
export const marcarTodasAlertasEntidadLeidas   = ()                => api.patch('/entidades/mis-alertas/leer-todas');
