package org.greenalert.events.config;

import org.greenalert.events.domain.EventStore;
import org.greenalert.events.adapter.DruidAnalytics;
import org.springframework.boot.actuate.health.*;
import org.springframework.context.annotation.*;

@Configuration
public class DependencyHealth {
    @Bean HealthIndicator cassandraHealthIndicator(EventStore store) {
        return () -> { try { store.probe(); return Health.up().build(); } catch(Exception e) { return Health.down().build(); } };
    }
    @Bean HealthIndicator druidHealthIndicator(DruidAnalytics analytics) {
        return () -> { try { analytics.probe(); return Health.up().build(); } catch(Exception e) { return Health.down().build(); } };
    }
}
