/**
 * Contratos estructurales del piloto. Son propiedad de la aplicación;
 * ningún puerto importa un framework, pool o modelo concreto.
 *
 * @typedef {Object} ReporteAnaliticaReader
 * @property {(filtro: {desde: Date, tipo: string|null}) => Promise<Array<Object>>} findParaPrediccion
 * Las filas conservan latitud/longitud como número o decimal textual y
 * created_at como Date o ISO. Solo reportes moderados con ubicación.
 *
 * @typedef {Object} Clock
 * @property {() => number} now Milisegundos Unix.
 *
 * @typedef {Object} PredictionCache
 * @property {(key: string) => Object|null} get
 * @property {(key: string, value: Object) => Object} set
 * @property {() => void} clear Invalida también el namespace de alertas heredadas.
 * @property {() => number} size
 *
 * @typedef {{dias: number, desde: Date, tipo: string|null, min_score: number}} ZonasParams
 * @typedef {(params: ZonasParams) => Promise<Object>} ConsultarZonasRiesgo Puerto de entrada.
 */
export {};
