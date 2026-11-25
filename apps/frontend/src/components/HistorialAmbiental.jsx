import { useState } from 'react';
import { consultarHistorialAmbiental } from '../services/api';

export default function HistorialAmbiental({ id }) {
  const [rows,setRows]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function load() {
    setBusy(true); setError('');
    try { setRows((await consultarHistorialAmbiental(id)).data.data); }
    catch(e) { setError(e.response?.data?.message || 'No fue posible consultar el historial.'); }
    finally { setBusy(false); }
  }
  const label={REPORT_CREATED:'Reporte creado',REPORT_STATUS_CHANGED:'Estado actualizado',ENVIRONMENTAL_OBSERVATION:'Observación ambiental'};
  return <section className="rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-3">
    <h2 className="font-semibold text-white">Historial ambiental</h2>
    <button onClick={load} disabled={busy} className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white disabled:opacity-50">
      {busy?'Consultando…':'Consultar historial ambiental'}
    </button>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {rows && <ul aria-live="polite" className="space-y-2 text-sm text-gray-300">
      {rows.map(row=><li key={row.eventId}>{new Date(row.occurredAt).toLocaleString('es-CO')} · {label[row.type] || 'Evento ambiental'}</li>)}
      {!rows.length && <li>No hay eventos en el período consultado. Los eventos pendientes aparecerán después de su entrega.</li>}
    </ul>}
  </section>;
}
