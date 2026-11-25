package org.greenalert.events.adapter;

import com.fasterxml.jackson.databind.*;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import org.greenalert.events.config.Settings;
import org.greenalert.events.domain.EnvironmentalEvent;
import org.springframework.stereotype.Component;

@Component
public class DruidAnalytics {
    private static final String DATASOURCE = "greenalert_events_v1";
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private final Settings settings;
    private final ObjectMapper json;
    public DruidAnalytics(Settings settings, ObjectMapper json) { this.settings=settings; this.json=json; }

    public record Projection(String taskId, String state, int sourceEvents, String interval) { }

    public Projection replace(LocalDate day, List<EnvironmentalEvent> events) {
        if (events.isEmpty()) return new Projection(null,"EMPTY",0,day+"/"+day.plusDays(1));
        String interval=day+"/"+day.plusDays(1);
        var lines = events.stream().map(e -> {
            var row=new LinkedHashMap<String,Object>();
            row.put("timestamp", e.occurredAt().toString());
            row.put("type", e.type().name()); row.put("category", e.category());
            row.put("severity", e.severity()==null?null:e.severity().toString()); row.put("zone", e.zone());
            row.put("created", e.type()==EnvironmentalEvent.EventType.REPORT_CREATED?1:0);
            return encode(row);
        }).collect(Collectors.joining("\n"));
        var dataSchema=Map.of("dataSource",DATASOURCE,
            "timestampSpec",Map.of("column","timestamp","format","iso"),
            "dimensionsSpec",Map.of("dimensions",List.of("type","category","severity","zone")),
            "metricsSpec",List.of(Map.of("type","count","name","events"),Map.of("type","longSum","name","reportsCreated","fieldName","created")),
            "granularitySpec",Map.of("type","uniform","segmentGranularity","DAY","queryGranularity","HOUR","rollup",true,"intervals",List.of(interval)));
        var io=Map.of("type","index","inputSource",Map.of("type","inline","data",lines),
            "inputFormat",Map.of("type","json"),"appendToExisting",false,"dropExisting",true);
        var spec=Map.of("type","index","spec",Map.of("dataSchema",dataSchema,"ioConfig",io,
            "tuningConfig",Map.of("type","index","maxRowsInMemory",10000)),
            "context",Map.of("forceTimeChunkLock",true,"awaitSegmentAvailabilityTimeoutMillis",60000));
        String task = request(settings.druidTaskUrl(), "/druid/indexer/v1/task", spec).path("task").asText();
        if (task.isBlank()) throw new IllegalStateException("Druid no devolvió taskId");
        long deadline=System.nanoTime()+Duration.ofSeconds(settings.druidTaskTimeoutSeconds()).toNanos();
        while (System.nanoTime()<deadline) {
            String state;
            try { state=request(settings.druidTaskUrl(),"/druid/indexer/v1/task/"+task+"/status",null).path("status").path("status").asText(); }
            catch(IllegalStateException e) { throw new DruidTaskException(task,"UNKNOWN"); }
            if (state.equals("SUCCESS")) return new Projection(task,state,events.size(),interval);
            if (state.equals("FAILED")) throw new DruidTaskException(task,"FAILED");
            try { Thread.sleep(500); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new DruidTaskException(task,"UNKNOWN"); }
        }
        // No se presupone cancelación remota: el operador consulta taskId antes del replay.
        throw new DruidTaskException(task,"UNKNOWN");
    }

    public JsonNode indicators(Instant from, Instant to, String category, Integer severity, String zone) {
        StringBuilder sql=new StringBuilder("SELECT TIME_FLOOR(\"__time\", 'PT1H') AS \"hour\", \"category\", \"severity\", \"zone\", SUM(\"events\") AS \"events\", SUM(\"reportsCreated\") AS \"reportsCreated\" FROM \""+DATASOURCE+"\" WHERE \"__time\" >= MILLIS_TO_TIMESTAMP(?) AND \"__time\" < MILLIS_TO_TIMESTAMP(?)");
        var params=new ArrayList<Map<String,Object>>();
        params.add(Map.of("type","BIGINT","value",from.toEpochMilli()));
        params.add(Map.of("type","BIGINT","value",to.toEpochMilli()));
        if (category!=null) { sql.append(" AND \"category\" = ?"); params.add(Map.of("type","VARCHAR","value",category)); }
        if (severity!=null) { sql.append(" AND \"severity\" = ?"); params.add(Map.of("type","VARCHAR","value",severity.toString())); }
        if (zone!=null) { sql.append(" AND \"zone\" = ?"); params.add(Map.of("type","VARCHAR","value",zone)); }
        sql.append(" GROUP BY 1,2,3,4 ORDER BY 1,2,3,4 LIMIT 10001");
        JsonNode rows=request(settings.druidQueryUrl(),"/druid/v2/sql",Map.of("query",sql.toString(),"parameters",params,"context",Map.of("timeout",5000)));
        if(rows.size()>10000) throw new IllegalArgumentException("Demasiados agregados; acotar rango o filtros");
        return rows;
    }
    public void probe() {
        request(settings.druidTaskUrl(),"/status/health",null);
        request(settings.druidQueryUrl(),"/druid/v2/sql",Map.of("query","SELECT 1"));
    }
    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException("JSON inválido",e); }
    }
    private JsonNode request(String base,String path,Object body) {
        var builder=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(8));
        if(body!=null) builder.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(encode(body)));
        else builder.GET();
        try {
            var response=http.send(builder.build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()/100!=2) throw new IllegalStateException("Druid HTTP "+response.statusCode());
            return json.readTree(response.body());
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("Druid interrumpido",e); }
        catch (java.io.IOException e) { throw new IllegalStateException("Druid no disponible",e); }
    }
}
