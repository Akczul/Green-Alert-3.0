import { seguridad } from '../bootstrap/seguridad.js';
import { Server } from 'socket.io';
import { getCorsOptions } from './security.config.js';

export const SOCKET_EVENTS = {
  REPORTE_CRITICO_ASIGNADO: 'reporte:critico_asignado',
};

const PRIORIDADES_TIEMPO_REAL = new Set(['critica']);

let ioInstance = null;

export const getEntidadRoom = (idEntidad) => `entidad:${Number(idEntidad)}`;

const getEntidadIdFromUser = (user) => Number(user?.id_entidad ?? user?.entidad_id);

const getSocketToken = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const authorization = socket.handshake?.headers?.authorization;
  if (typeof authorization !== 'string') return null;

  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

export const authenticateSocket = async (socket, next) => {
  const token = getSocketToken(socket);
  if (!token) {
    return next(new Error('token requerido'));
  }

  try {
    const user = await seguridad.verificarAcceso(token);
    const idEntidad = getEntidadIdFromUser(user);

    if (user?.rol === 'entidad' && (!Number.isInteger(idEntidad) || idEntidad <= 0)) {
      return next(new Error('usuario entidad sin entidad asociada'));
    }

    socket.user = user;
    socket.data = { ...socket.data, accessToken: token };
    return next();
  } catch {
    return next(new Error('token invalido'));
  }
};

export const handleSocketConnection = (socket) => {
  if (socket.user?.rol !== 'entidad') return;

  const idEntidad = getEntidadIdFromUser(socket.user);
  if (!Number.isInteger(idEntidad) || idEntidad <= 0) {
    socket.disconnect?.(true);
    return;
  }

  socket.join(getEntidadRoom(idEntidad));
};

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: getCorsOptions(),
  });

  io.use(authenticateSocket);
  io.on('connection', handleSocketConnection);

  ioInstance = io;
  return io;
};

export const setSocketServerForTests = (io) => {
  ioInstance = io;
};

export const buildReporteCriticoPayload = ({ reporte, assignment }) => ({
  reporte: {
    id_reporte: reporte.id_reporte,
    uuid: reporte.uuid ?? null,
    titulo: reporte.titulo ?? null,
    descripcion: reporte.descripcion ?? null,
    categoria: reporte.tipo_contaminacion ?? reporte.categoria ?? null,
    subcategoria: reporte.subcategoria ?? null,
    nivel_severidad: reporte.nivel_severidad ?? null,
    estado: reporte.estado ?? null,
    created_at: reporte.created_at ?? null,
    latitud: reporte.latitud ?? null,
    longitud: reporte.longitud ?? null,
    municipio: reporte.municipio ?? null,
    departamento: reporte.departamento ?? null,
    direccion: reporte.direccion ?? null,
  },
  asignacion: {
    tipo_asignacion: assignment.tipo_asignacion ?? null,
    prioridad: assignment.prioridad ?? null,
    asignado_at: assignment.asignado_at ?? null,
  },
  entidad: {
    id_entidad: assignment.entidad?.id_entidad ?? assignment.id_entidad,
    codigo: assignment.entidad?.codigo ?? null,
    nombre: assignment.entidad?.nombre ?? null,
  },
});

export const notificarReporteCriticoAEntidad = (idEntidad, payload) => {
  const id = Number(idEntidad);
  if (!ioInstance || !Number.isInteger(id) || id <= 0) return false;

  // Revalidar antes de cada entrega privada, también en conexiones ya abiertas.
  void ioInstance.in(getEntidadRoom(id)).fetchSockets().then(async (sockets) => {
    await Promise.all(sockets.map(async (socket) => {
      try {
        await seguridad.verificarAcceso(socket.data?.accessToken);
        socket.emit(SOCKET_EVENTS.REPORTE_CRITICO_ASIGNADO, payload);
      } catch { socket.disconnect(true); }
    }));
  }).catch(() => console.error('[socket] No fue posible validar las sesiones de entrega.'));

  return true;
};

export const notificarReporteCriticoAsignado = ({ reporte, assignments = [] }) => {
  if (!reporte?.id_reporte || !Array.isArray(assignments)) return 0;

  let total = 0;

  for (const assignment of assignments) {
    if (!PRIORIDADES_TIEMPO_REAL.has(assignment.prioridad)) continue;

    const sent = notificarReporteCriticoAEntidad(
      assignment.id_entidad,
      buildReporteCriticoPayload({ reporte, assignment })
    );

    if (sent) total += 1;
  }

  return total;
};
