-- Solo el keyspace exclusivo de este servicio; no se ejecuta en bases del usuario.
CREATE KEYSPACE IF NOT EXISTS greenalert_events WITH replication = {'class':'NetworkTopologyStrategy','datacenter1':1};
CREATE TABLE IF NOT EXISTS greenalert_events.events_by_id (
  event_id uuid PRIMARY KEY, payload text
);
CREATE TABLE IF NOT EXISTS greenalert_events.events_by_report (
  report_id uuid, month text, occurred_at timestamp, event_id uuid, payload text,
  PRIMARY KEY ((report_id,month),occurred_at,event_id)
) WITH CLUSTERING ORDER BY (occurred_at ASC,event_id ASC);
CREATE TABLE IF NOT EXISTS greenalert_events.events_by_day (
  day date, shard int, occurred_at timestamp, event_id uuid, payload text,
  PRIMARY KEY ((day,shard),occurred_at,event_id)
) WITH CLUSTERING ORDER BY (occurred_at ASC,event_id ASC);
