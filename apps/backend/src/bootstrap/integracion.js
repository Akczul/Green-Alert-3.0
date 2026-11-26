import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { createOperaciones } from '../modules/integracion/application/operaciones.js';
import { createSnapshots } from '../modules/integracion/adapters/outbound/mysql-snapshots.js';
import { createInternalClient } from '../modules/integracion/adapters/outbound/http-clients.js';
import { createOutbox } from '../modules/integracion/adapters/outbound/outbox.js';

const disabled = async () => { throw Object.assign(new Error('Integración no configurada.'), { statusCode: 503 }); };
const analyticsHttp = process.env.ANALYTICS_URL ? createInternalClient({
  baseUrl: process.env.ANALYTICS_URL, token: process.env.ANALYTICS_INTERNAL_TOKEN, scopeHeader: true }) : null;
const eventsHttp = process.env.EVENTS_URL ? createInternalClient({
  baseUrl: process.env.EVENTS_URL, token: process.env.EVENTS_SERVICE_TOKEN }) : null;
const events = {
  history: eventsHttp ? (id, range) => eventsHttp.request(`/api/v1/reports/${id}/events?${new URLSearchParams(range)}`) : disabled,
  indicators: eventsHttp ? filters => eventsHttp.request(`/api/v1/indicators?${new URLSearchParams(filters)}`) : disabled,
};
export const operaciones = createOperaciones({ snapshots: createSnapshots({ pool }),
  analytics: { analyzeRisk: analyticsHttp ? (body, context) => analyticsHttp.request('/internal/v1/risk-runs', { body, ...context }) : disabled },
  events, uuid: randomUUID, clock: { now: Date.now } });
export const outbox = createOutbox({ pool, publish: eventsHttp
  ? (body, correlationId) => eventsHttp.request('/api/v1/events', { body, correlationId }) : disabled });
export async function reconcile(day) {
  if (!eventsHttp) return disabled();
  return eventsHttp.request(`/api/v1/reconciliation/${day}`, { body: {},
    credential: process.env.EVENTS_RECONCILE_TOKEN, timeout: 240000 });
}
export function startOutbox() {
  if (!eventsHttp) return;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await outbox.drain(); }
    catch { console.error('[outbox] entrega pendiente; revisar migración o dependencia'); }
    finally { running = false; }
  }, 5000);
  timer.unref();
}
