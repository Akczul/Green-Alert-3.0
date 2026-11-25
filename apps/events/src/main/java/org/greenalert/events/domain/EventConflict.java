package org.greenalert.events.domain;

public class EventConflict extends RuntimeException {
    public EventConflict() { super("eventId ya existe con otro contenido"); }
}
