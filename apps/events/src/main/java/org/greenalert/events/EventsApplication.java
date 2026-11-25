package org.greenalert.events;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.greenalert.events.config.Settings;

@SpringBootApplication
@EnableConfigurationProperties(Settings.class)
public class EventsApplication {
    public static void main(String[] args) { SpringApplication.run(EventsApplication.class, args); }
}
