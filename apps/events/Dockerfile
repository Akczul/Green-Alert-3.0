FROM maven:3.9.11-eclipse-temurin-17@sha256:e4a7ace3dc0d645ed97f8d9ad0b0d3f0b14fa8d150138f27f116d7105a639b82 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -ntp dependency:go-offline
COPY src src
RUN mvn -B -ntp package

FROM eclipse-temurin:17.0.17_10-jre-jammy@sha256:03c5b280ad53c041741552f231f5b65d97be39ca74fa4c7c1c9ace7f42cc3c9e
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 events && useradd --uid 10001 --gid events --no-create-home events
WORKDIR /app
COPY --from=build --chown=10001:10001 /build/target/events-1.0.0.jar /app/events.jar
USER 10001:10001
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65 -XX:ActiveProcessorCount=4"
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/events.jar"]
