package org.greenalert.events.config;

import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("events")
public record Settings(
    @NotBlank @Size(min=32) String serviceToken,
    @NotBlank @Size(min=32) String reconcileToken,
    @NotBlank String cassandraHost, @Min(1) @Max(65535) int cassandraPort,
    @NotBlank String cassandraDatacenter,
    @Pattern(regexp="[a-z][a-z0-9_]{0,47}") String cassandraKeyspace,
    String cassandraUser, String cassandraPassword,
    @NotBlank String druidQueryUrl, @NotBlank String druidTaskUrl,
    @Min(1) @Max(16) int workers, @Min(1) @Max(512) int queueCapacity,
    @Min(10) @Max(600) int druidTaskTimeoutSeconds) { }
