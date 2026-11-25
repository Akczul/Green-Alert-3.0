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
      setResult(response.data.data);
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
      {result && <pre aria-live="polite" className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-gray-200">{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}
