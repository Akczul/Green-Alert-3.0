package org.greenalert.events.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.greenalert.events.config.Settings;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ServiceSecurity extends OncePerRequestFilter {
    private final Settings settings;
    private final ObjectMapper json;
    public ServiceSecurity(Settings settings,ObjectMapper json) {
        this.settings=settings; this.json=json;
        if(settings.serviceToken().equals(settings.reconcileToken())) throw new IllegalArgumentException("Los tokens de servicio y reconciliación deben ser distintos");
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String correlation=request.getHeader("X-Correlation-ID");
        if(correlation==null) correlation=UUID.randomUUID().toString();
        if(!correlation.matches("[a-zA-Z0-9_.-]{1,64}")) { error(response,400,"Correlación inválida"); return; }
        request.setAttribute("correlationId",correlation);
        response.setHeader("X-Correlation-ID",correlation);
        String path=request.getServletPath();
        if(path.equals("/actuator/health")||path.equals("/actuator/health/liveness")) { chain.doFilter(request,response); return; }
        boolean reconcile=path.startsWith("/api/v1/reconciliation");
        String expected="Bearer "+(reconcile?settings.reconcileToken():settings.serviceToken());
        String actual=Optional.ofNullable(request.getHeader("Authorization")).orElse("");
        if(!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),actual.getBytes(StandardCharsets.UTF_8))) {
            response.setHeader("WWW-Authenticate","Bearer"); error(response,401,"Credencial de servicio inválida"); return;
        }
        if(request.getContentLengthLong()>262144) { error(response,413,"Payload supera 256 KiB"); return; }
        // También limita transferencias chunked; no depende solo de Content-Length.
        if(Set.of("POST","PUT","PATCH").contains(request.getMethod())) {
            byte[] bytes=request.getInputStream().readNBytes(262145);
            if(bytes.length>262144) { error(response,413,"Payload supera 256 KiB"); return; }
            var wrapped=new HttpServletRequestWrapper(request) {
                @Override public ServletInputStream getInputStream() {
                    var input=new java.io.ByteArrayInputStream(bytes);
                    return new ServletInputStream() {
                        public int read() { return input.read(); }
                        public boolean isFinished() { return input.available()==0; }
                        public boolean isReady() { return true; }
                        public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
                    };
                }
            };
            chain.doFilter(wrapped,response);
        } else chain.doFilter(request,response);
    }
    private void error(HttpServletResponse response,int code,String message) throws IOException {
        response.setStatus(code); response.setContentType("application/json");
        json.writeValue(response.getOutputStream(),Map.of("status","error","message",message));
    }
}
