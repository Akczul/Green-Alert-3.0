package org.greenalert.events.domain;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;

public record EnvironmentalEvent(
    @NotNull UUID eventId, @NotNull UUID reportId,
    @Min(1) @Max(1) int schemaVersion,
    @NotNull EventType type, @NotNull Instant occurredAt,
    @Min(0) long sourceRevision,
    @Pattern(regexp="[a-zA-Z0-9_-]{1,64}") String category,
    @Min(0) @Max(5) Integer severity,
    @Pattern(regexp="[a-zA-Z0-9_-]{1,64}") String zone) {
    public enum EventType { REPORT_CREATED, REPORT_STATUS_CHANGED, ENVIRONMENTAL_OBSERVATION }
    public void checkTimestamp() {
        if (occurredAt.isBefore(Instant.parse("2000-01-01T00:00:00Z")) ||
            occurredAt.isAfter(Instant.now().plusSeconds(300)) || occurredAt.getNano() % 1_000_000 != 0)
            throw new IllegalArgumentException("occurredAt debe estar entre 2000 y ahora +5 min, con precisión de milisegundos");
    }
}
