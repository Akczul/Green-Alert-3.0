package org.greenalert.events.config;

import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.config.*;
import java.net.InetSocketAddress;
import java.time.Duration;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.security.*;

@Configuration
public class Infrastructure {
    @Bean(destroyMethod="close")
    CqlSession cassandraSession(Settings s) {
        var loader = DriverConfigLoader.programmaticBuilder()
            .withDuration(DefaultDriverOption.REQUEST_TIMEOUT, Duration.ofSeconds(5))
            .withDuration(DefaultDriverOption.CONNECTION_CONNECT_TIMEOUT, Duration.ofSeconds(5))
            .withString(DefaultDriverOption.REQUEST_CONSISTENCY, "LOCAL_QUORUM")
            .withString(DefaultDriverOption.REQUEST_SERIAL_CONSISTENCY, "LOCAL_SERIAL")
            .withInt(DefaultDriverOption.NETTY_IO_SIZE, 2)
            .withInt(DefaultDriverOption.NETTY_ADMIN_SIZE, 1).build();
        var builder = CqlSession.builder().addContactPoint(new InetSocketAddress(s.cassandraHost(), s.cassandraPort()))
            .withLocalDatacenter(s.cassandraDatacenter()).withKeyspace(s.cassandraKeyspace()).withConfigLoader(loader);
        if (!s.cassandraUser().isBlank()) builder.withAuthCredentials(s.cassandraUser(), s.cassandraPassword());
        return builder.build();
    }

    @Bean
    ThreadPoolTaskExecutor eventExecutor(Settings s) {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(s.workers());
        executor.setMaxPoolSize(s.workers());
        executor.setQueueCapacity(s.queueCapacity());
        executor.setThreadNamePrefix("events-io-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(25);
        return executor;
    }

    @Bean OpenAPI openApi() {
        return new OpenAPI().info(new Info().title("GreenAlert Events").version("1.0.0")
            .description("API interna. Identidad de servicio, no credenciales de usuarios. Rangos [from,to) UTC."))
            .components(new Components().addSecuritySchemes("service", new SecurityScheme()
                .type(SecurityScheme.Type.HTTP).scheme("bearer")))
            .addSecurityItem(new SecurityRequirement().addList("service"));
    }
}
