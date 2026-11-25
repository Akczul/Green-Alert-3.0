package org.greenalert.events.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.Map;
import java.util.concurrent.RejectedExecutionException;
import org.greenalert.events.domain.EventConflict;
import org.greenalert.events.adapter.DruidTaskException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.*;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class Errors {
    @ExceptionHandler(DruidTaskException.class)
    ResponseEntity<?> task(DruidTaskException e,HttpServletRequest request) {
        var response=new java.util.LinkedHashMap<>(body("Consultar task Druid antes de repetir intervalo",request));
        response.put("taskId",e.taskId()); response.put("projectionState",e.state());
        return ResponseEntity.status(503).body(response);
    }
    @ExceptionHandler(EventConflict.class)
    ResponseEntity<?> conflict(EventConflict e,HttpServletRequest request) { return error(409,e.getMessage(),request); }
    @ExceptionHandler({IllegalArgumentException.class,MethodArgumentNotValidException.class,
        HttpMessageNotReadableException.class,ConstraintViolationException.class,HandlerMethodValidationException.class,
        MethodArgumentTypeMismatchException.class,MissingServletRequestParameterException.class})
    ResponseEntity<?> invalid(Exception e,HttpServletRequest request) { return error(400,"Solicitud inválida; revisar tipos, límites y rango UTC",request); }
    @ExceptionHandler(RejectedExecutionException.class)
    ResponseEntity<?> busy(Exception e,HttpServletRequest request) {
        return ResponseEntity.status(429).header("Retry-After","5").body(body("Capacidad ocupada; reintentar mismos IDs",request));
    }
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<?> missing(Exception e,HttpServletRequest request) { return error(404,"Recurso no encontrado",request); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unavailable(Exception e,HttpServletRequest request) {
        // No serializar mensajes de drivers: pueden contener topología o credenciales.
        org.slf4j.LoggerFactory.getLogger(Errors.class).warn("Fallo dependencia correlation={} tipo={}",request.getAttribute("correlationId"),e.getClass().getSimpleName());
        return error(503,"Dependencia no disponible o timeout; resultado parcial posible, reintentar mismos IDs o intervalo",request);
    }
    private Map<String,Object> body(String message,HttpServletRequest request) {
        return Map.of("status","error","message",message,"correlationId",String.valueOf(request.getAttribute("correlationId")));
    }
    private ResponseEntity<?> error(int status,String message,HttpServletRequest request) { return ResponseEntity.status(status).body(body(message,request)); }
}
