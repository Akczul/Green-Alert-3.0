package org.greenalert.events.api;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.greenalert.events.application.EventService;
import org.greenalert.events.adapter.DruidAnalytics;
import org.greenalert.events.domain.EnvironmentalEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
@RequestMapping("/api/v1")
@Validated
public class EventController {
    private final EventService service;
    private final DruidAnalytics analytics;
    public EventController(EventService service,DruidAnalytics analytics) { this.service=service; this.analytics=analytics; }
    public record Envelope<T>(String status,String message,T data) {
        public static <T> Envelope<T> ok(T value) { return new Envelope<>("success","Operación completada",value); }
    }
    public record Batch(@NotEmpty @Size(max=64) List<@NotNull @Valid EnvironmentalEvent> events) { }
    public enum Mode { sequential, concurrent }
    @PostMapping("/events")
    @Operation(summary="Registrar evento inmutable; mismo ID/contenido permite reintento")
    @ApiResponse(responseCode="201",description="Persistido en Cassandra")
    @ApiResponse(responseCode="200",description="Reintento idempotente")
    @ApiResponse(responseCode="409",description="ID con contenido diferente")
    public ResponseEntity<Envelope<EventService.Receipt>> register(@Valid @RequestBody EnvironmentalEvent event) {
        var receipt=service.register(event);
        return ResponseEntity.status(receipt.created()?201:200).body(Envelope.ok(receipt));
    }
    @PostMapping("/events/batches")
    @Operation(summary="Lote hasta 64 eventos; fallo puede ser parcial, repetir IDs originales")
    public Envelope<List<EventService.Receipt>> batch(@Valid @RequestBody Batch batch,@RequestParam(defaultValue="concurrent") Mode mode) {
        return Envelope.ok(service.batch(batch.events(),mode==Mode.concurrent));
    }
    @GetMapping("/reports/{reportId}/events")
    @Operation(summary="Historial ascendente, rango [from,to), máximo 366 días; truncado a limit")
    public Envelope<List<EnvironmentalEvent>> history(@PathVariable UUID reportId,@RequestParam Instant from,@RequestParam Instant to,
        @RequestParam(defaultValue="100") int limit) { return Envelope.ok(service.history(reportId,from,to,limit)); }
    @PostMapping("/reconciliation/{day}")
    @Operation(summary="Reconstruir día UTC completo en Druid; requiere token de reconciliación")
    public Envelope<DruidAnalytics.Projection> reconcile(@PathVariable LocalDate day) { return Envelope.ok(service.reconcile(day)); }
    @GetMapping("/indicators")
    @Operation(summary="Agregados Druid con límites de hora UTC; events cuenta eventos y reportsCreated hechos REPORT_CREATED")
    public Envelope<JsonNode> indicators(@RequestParam Instant from,@RequestParam Instant to,
        @RequestParam(required=false) @Pattern(regexp="[a-zA-Z0-9_-]{1,64}") String category,
        @RequestParam(required=false) @Min(0) @Max(5) Integer severity,
        @RequestParam(required=false) @Pattern(regexp="[a-zA-Z0-9_-]{1,64}") String zone) {
        EventService.hourRange(from,to);
        return Envelope.ok(analytics.indicators(from,to,category,severity,zone));
    }
}
