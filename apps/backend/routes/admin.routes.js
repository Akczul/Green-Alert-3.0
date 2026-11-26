import { Router } from 'express';
import { verifyToken, requireRoles } from '../middlewares/auth.middleware.js';
import { validatePositiveIdParam } from '../middlewares/validate-id.middleware.js';
import { statsUsuarios } from '../src/controllers/admin.controller.js';
import { adminHttp } from '../src/bootstrap/administracion.js';

const adminRouter = Router();

// Ambos niveles comparten rol 'admin'; el alcance por objeto se decide en el módulo administracion.
adminRouter.use(verifyToken, requireRoles('admin'));

adminRouter.get('/usuarios/stats', statsUsuarios);
adminRouter.get('/usuarios', adminHttp.listarUsuarios);
adminRouter.get('/usuarios/:id', validatePositiveIdParam('id'), adminHttp.obtenerUsuario);
adminRouter.patch('/usuarios/:id/rol', validatePositiveIdParam('id'), adminHttp.cambiarRol);
adminRouter.patch('/usuarios/:id/estado', validatePositiveIdParam('id'), adminHttp.cambiarEstado);
adminRouter.delete('/usuarios/:id', validatePositiveIdParam('id'), adminHttp.eliminarUsuario);
// Solo superadministrador; la auditoría es de solo lectura (no hay rutas de borrado).
adminRouter.get('/auditoria', adminHttp.listarAuditoria);

export default adminRouter;
