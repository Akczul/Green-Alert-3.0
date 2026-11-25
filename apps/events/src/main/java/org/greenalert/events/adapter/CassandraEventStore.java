package org.greenalert.events.adapter;

import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.greenalert.events.domain.*;
import org.springframework.stereotype.Repository;

@Repository
public class CassandraEventStore implements EventStore {
    private final CqlSession session;
    private final ObjectMapper json;
    private final PreparedStatement insertId, selectId, insertReport, insertDay, selectReport, selectDay;
    public CassandraEventStore(CqlSession session, ObjectMapper json) {
        this.session = session;
        this.json = json;
        insertId = session.prepare("INSERT INTO events_by_id (event_id,payload) VALUES (?,?) IF NOT EXISTS");
        selectId = session.prepare("SELECT payload FROM events_by_id WHERE event_id=?");
        insertReport = session.prepare("INSERT INTO events_by_report (report_id,month,occurred_at,event_id,payload) VALUES (?,?,?,?,?)");
        insertDay = session.prepare("INSERT INTO events_by_day (day,shard,occurred_at,event_id,payload) VALUES (?,?,?,?,?)");
        selectReport = session.prepare("SELECT payload FROM events_by_report WHERE report_id=? AND month=? AND occurred_at>=? AND occurred_at<? LIMIT ?");
        selectDay = session.prepare("SELECT payload FROM events_by_day WHERE day=? AND shard=? LIMIT ?");
    }
    @Override public boolean save(EnvironmentalEvent event) {
        String payload = encode(event);
        boolean created = session.execute(insertId.bind(event.eventId(), payload)).wasApplied();
        if (!created) {
            Row row = session.execute(selectId.bind(event.eventId())).one();
            if (row == null || !decode(row).equals(event)) throw new EventConflict();
        }
        // Reintentar también repara una caída entre el registro canónico y sus proyecciones.
        var utc = event.occurredAt().atZone(ZoneOffset.UTC);
        var batch = BatchStatement.builder(DefaultBatchType.LOGGED)
            .addStatement(insertReport.bind(event.reportId(), YearMonth.from(utc).toString(), event.occurredAt(), event.eventId(), payload))
            .addStatement(insertDay.bind(utc.toLocalDate(), shard(event.eventId()), event.occurredAt(), event.eventId(), payload)).build();
        session.execute(batch);
        return created;
    }
    public static int shard(UUID id) { return Math.floorMod(id.hashCode(), 16); }
    @Override public List<EnvironmentalEvent> history(UUID report, Instant from, Instant to, int limit) {
        var result = new ArrayList<EnvironmentalEvent>();
        var month = YearMonth.from(from.atZone(ZoneOffset.UTC));
        var last = YearMonth.from(to.minusMillis(1).atZone(ZoneOffset.UTC));
        while (!month.isAfter(last) && result.size() < limit) {
            session.execute(selectReport.bind(report, month.toString(), from, to, limit - result.size())).forEach(row -> result.add(decode(row)));
            month = month.plusMonths(1);
        }
        return result;
    }
    @Override public List<EnvironmentalEvent> day(LocalDate day, int limit) {
        var result = new ArrayList<EnvironmentalEvent>();
        for (int shard=0; shard<16; shard++) {
            for (Row row : session.execute(selectDay.bind(day, shard, limit + 1 - result.size()))) {
                result.add(decode(row));
                if (result.size() > limit) throw new IllegalArgumentException("Día supera límite de reconciliación de " + limit + " eventos");
            }
        }
        result.sort(Comparator.comparing(EnvironmentalEvent::occurredAt).thenComparing(EnvironmentalEvent::eventId));
        return result;
    }
    @Override public void probe() { session.execute("SELECT release_version FROM system.local"); }
    private String encode(EnvironmentalEvent event) {
        try { return json.writeValueAsString(event); }
        catch (Exception e) { throw new IllegalStateException("No se pudo serializar el evento", e); }
    }
    private EnvironmentalEvent decode(Row row) {
        try { return json.readValue(row.getString("payload"), EnvironmentalEvent.class); }
        catch (Exception e) { throw new IllegalStateException("Evento persistido inválido", e); }
    }
}
