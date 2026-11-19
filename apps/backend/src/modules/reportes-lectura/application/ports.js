/**
 * Puertos estructurales de lectura, propiedad de la aplicación.
 * @typedef {Object} ReportesReader
 * @property {function(Object): Promise<Array>} findAll
 * @property {function(Object): Promise<number>} countAll
 * @property {function(number): Promise<Object|null>} findById
 * @property {function(number,Object): Promise<Array>} findByUsuario
 * @property {function(number,Object): Promise<number>} countByUsuario
 * @property {function(Object): Promise<Array>} findTrending
 *
 * @typedef {Object} ReporteRelationsReader
 * @property {function(Object): Promise<Object|null>} findActiveEntity
 * @property {function(number,Object): Promise<Object>} findAssignedReports
 * @property {function(number,number): Promise<Object|null>} findAssignment
 * @property {function(number): Promise<Array>} findEvidence
 * @property {function(number): Promise<Object|null>} findAuthor
 * @property {function(Array,number): Promise<Set<number>>} likedSet
 *
 * @typedef {Object} ReporteViewRecorder
 * @property {function(Object): Promise<void>} record Efecto existente de GET detalle; no es una nueva operación de escritura.
 */
export {};
