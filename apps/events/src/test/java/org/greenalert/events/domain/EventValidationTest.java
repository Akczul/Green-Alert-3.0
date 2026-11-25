package org.greenalert.events.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.validation.Validation;
import org.greenalert.events.application.EventService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class EventValidationTest {
    private EnvironmentalEvent event(Instant timestamp,int schema,Integer severity,String category) {
        return new EnvironmentalEvent(UUID.randomUUID(),UUID.randomUUID(),schema,
            EnvironmentalEvent.EventType.REPORT_CREATED,timestamp,0,category,severity,null);
    }
    @Test void admitePrecisionPersistible() {
        assertDoesNotThrow(() -> event(Instant.parse("2026-01-01T00:00:00.123Z"),1,0,"agua").checkTimestamp());
    }
    @Test void rechazaPrecisionQueCassandraTruncaria() {
        assertThrows(IllegalArgumentException.class,() -> event(Instant.parse("2026-01-01T00:00:00.123456Z"),1,0,"agua").checkTimestamp());
    }
    @Test void rechazaFuturo() {
        var future=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS).plusSeconds(600);
        assertThrows(IllegalArgumentException.class,() -> event(future,1,0,"agua").checkTimestamp());
    }
    @Test void validaVersionSeveridadYCodigoSinTextoPersonal() {
        try(var factory=Validation.buildDefaultValidatorFactory()) {
            var violations=factory.getValidator().validate(event(Instant.now(),2,6,"texto libre @"));
            assertEquals(3,violations.size());
        }
    }
    @Test void rangoEsSemiabiertoYAcotado() {
        var start=Instant.parse("2026-01-01T00:00:00Z");
        assertThrows(IllegalArgumentException.class,() -> EventService.range(start,start));
        assertThrows(IllegalArgumentException.class,() -> EventService.range(start,start.plusSeconds(367L*86400)));
        assertDoesNotThrow(() -> EventService.range(start,start.plusSeconds(86400)));
    }
    @Test void indicadoresNoPrometenPrecisionQueElRollupPerdio() {
        var start=Instant.parse("2026-01-01T00:00:00Z");
        assertThrows(IllegalArgumentException.class,() -> EventService.hourRange(start.plusSeconds(1),start.plusSeconds(3600)));
        assertDoesNotThrow(() -> EventService.hourRange(start,start.plusSeconds(3600)));
    }
}
