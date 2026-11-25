import { useState } from 'react';
import { analizarRiesgoAmbiental, consultarIndicadoresAmbientales } from '../../services/api';

export default function IntegracionAmbiental() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  async function run(kind) {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = kind === 'riesgo'
        ? await analizarRiesgoAmbiental()
        : await consultarIndicadoresAmbientales();
      setResult({ kind, data: response.data.data });
    } catch (e) { setError(e.response?.data?.message || 'No fue posible consultar el servicio ambiental.'); }
    finally { setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-900 p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">Análisis ambiental</h2>
      <p className="text-sm text-gray-400">Calcula el riesgo de los reportes validados o consulta los indicadores históricos.</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => run('riesgo')} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">Calcular riesgo ambiental</button>
        <button disabled={busy} onClick={() => run('indicadores')} className="rounded-lg bg-gray-700 px-4 py-2 text-white disabled:opacity-50">Consultar indicadores</button>
      </div>
      {busy && <p role="status">Procesando…</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {result?.kind === 'riesgo' && <div aria-live="polite" className="space-y-3">
        <p className="text-sm text-gray-300">Zonas identificadas: {result.data.results?.zonas?.length ?? 0}</p>
        <ul className="max-h-80 overflow-auto space-y-2">
          {(result.data.results?.zonas ?? []).map((zone,index)=><li key={zone.zona_id}
            className="rounded-lg bg-gray-800 p-3 text-sm text-gray-200">
            <strong>{zone.municipio || `Zona ${index+1}`}</strong> · {zone.tipo_dominante?.replaceAll('_',' ')}
            <p>{zone.n_reportes} reportes · Riesgo {zone.nivel} · Puntuación {zone.score}/100 · Tendencia {zone.tendencia}</p>
          </li>)}
        </ul>
      </div>}
      {result?.kind === 'indicadores' && <div aria-live="polite" className="max-h-80 overflow-auto">
        {!result.data.length ? <p className="text-sm text-gray-300">No hay indicadores en el período consultado.</p> :
          <table className="w-full text-left text-sm text-gray-300">
            <thead><tr><th className="p-2">Hora UTC</th><th className="p-2">Categoría</th><th className="p-2">Eventos</th><th className="p-2">Reportes creados</th></tr></thead>
            <tbody>{result.data.map((row,index)=><tr key={index} className="border-t border-gray-700">
              <td className="p-2">{row.hour}</td><td className="p-2">{row.category?.replaceAll('_',' ') || 'Sin categoría'}</td>
              <td className="p-2">{row.events}</td><td className="p-2">{row.reportsCreated}</td>
            </tr>)}</tbody>
          </table>}
      </div>}
    </section>
  );
}
