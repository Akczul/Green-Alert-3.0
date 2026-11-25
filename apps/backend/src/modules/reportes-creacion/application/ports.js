/**
 * Contratos estructurales de salida requeridos por CrearReporte.
 * @typedef {Object} ReporteCreationStore
 * @property {function(Object): Promise<number>} create
 * @property {function(number): Promise<Object|null>} findById
 * @property {function(number,Object): Promise<boolean>} updateIaAnalysis
 * @property {function(number): Promise<boolean>} remove Compensación heredada por borrado lógico.
 *
 * @typedef {Object} EvidenceStorage
 * @property {function(Array): (string|null)} validateContent
 * @property {function(Object,Object): Promise<{uploadResult:Object,evidencia:Object}>} upload
 * @property {function(Array): Promise<void>} cleanup Limpieza best effort heredada.
 *
 * @typedef {Object} CrearReporteDependencies
 * @property {ReporteCreationStore} reportes
 * @property {{esValido:function(string):Promise<boolean>}} categorias
 * @property {{create:function(Object):Promise<number>}} evidencias
 * @property {EvidenceStorage} archivos
 * @property {{score:function(Array,string):Promise<Object>, analizar:function(Object):Object}} analisis
 * @property {{asignar:function(Object):Promise<*>, invalidateCache:function():void}} efectos
 * @property {{error:function(...*):void}} logger
 */
export {};
