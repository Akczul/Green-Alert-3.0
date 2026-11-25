import { randomUUID } from 'node:crypto';
// La respuesta crítica solo se confirma después de persistir su registro de auditoría.
// No se guardan cuerpos, correos, contraseñas, tokens ni query strings.
export function createAuditMiddleware({ pool }) {
  return (req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
      const path = req.originalUrl.split('?')[0];
      const critical = req.user && (req.method !== 'GET' || path.includes('/admin/'));
      if (!critical) return json(body);
      res.json = json;
      void pool.execute(`INSERT INTO security_audit
        (actor_id,method,resource,status_code,correlation_id) VALUES (?,?,?,?,?)`,
      [req.user.sub,req.method,path.slice(0,200),res.statusCode,randomUUID()])
        .then(() => json(body))
        .catch(() => { res.status(503); json({ status: 'error', message: 'No fue posible confirmar la auditoría. Consulta el estado antes de reintentar.' }); });
      return res;
    };
    next();
  };
}
