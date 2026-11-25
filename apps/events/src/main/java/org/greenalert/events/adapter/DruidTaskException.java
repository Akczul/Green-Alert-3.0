package org.greenalert.events.adapter;

public class DruidTaskException extends RuntimeException {
    private final String taskId;
    private final String state;
    public DruidTaskException(String taskId,String state) {
        super("Consultar task antes de repetir el intervalo");
        this.taskId=taskId; this.state=state;
    }
    public String taskId() { return taskId; }
    public String state() { return state; }
}
