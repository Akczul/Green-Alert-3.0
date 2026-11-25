package org.greenalert.events.domain;

import java.time.*;
import java.util.*;

public interface EventStore {
    boolean save(EnvironmentalEvent event);
    List<EnvironmentalEvent> history(UUID reportId, Instant from, Instant to, int limit);
    List<EnvironmentalEvent> day(LocalDate day, int limit);
    void probe();
}
