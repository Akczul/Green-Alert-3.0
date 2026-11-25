package org.greenalert.events.application;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.concurrent.atomic.AtomicInteger;
import io.micrometer.core.instrument.MeterRegistry;
import org.greenalert.events.domain.*;
import org.greenalert.events.adapter.DruidAnalytics;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

@Service
public class EventService {
    private final EventStore store;
    private final DruidAnalytics analytics;
    private final ThreadPoolTaskExecutor executor;
    // Una réplica: el snapshot y la publicación se aíslan de nuevas escrituras.
    private final ReentrantReadWriteLock projectionLock=new ReentrantReadWriteLock(true);
    private final Semaphore reconcileSlot=new Semaphore(1);
    private final AtomicInteger active=new AtomicInteger();
    private final AtomicInteger peak=new AtomicInteger();
    private final MeterRegistry metrics;
    public EventService(EventStore store,DruidAnalytics analytics,ThreadPoolTaskExecutor executor,MeterRegistry metrics) {
        this.store=store; this.analytics=analytics; this.executor=executor;
        this.metrics=metrics;
        metrics.gauge("events.processing.active",active);
        metrics.gauge("events.processing.peak",peak);
    }
    public record Receipt(UUID eventId, boolean created) { }
    public Receipt register(EnvironmentalEvent event) {
        event.checkTimestamp();
        var lock=projectionLock.readLock();
        if(!lock.tryLock()) throw new RejectedExecutionException("Reconciliación en curso; reintentar");
        int current=active.incrementAndGet();
        peak.accumulateAndGet(current,Math::max);
        long start=System.nanoTime();
        try {
            boolean created=store.save(event);
            metrics.counter("events.accepted","result",created?"created":"replayed").increment();
            return new Receipt(event.eventId(),created);
        } finally {
            metrics.timer("events.persistence").record(System.nanoTime()-start,TimeUnit.NANOSECONDS);
            active.decrementAndGet(); lock.unlock();
        }
    }
    public List<Receipt> batch(List<EnvironmentalEvent> events, boolean concurrent) {
        events.forEach(EnvironmentalEvent::checkTimestamp);
        if(!concurrent) return events.stream().map(this::register).toList();
        var futures=new ArrayList<Future<Receipt>>();
        try {
            for(var event:events) futures.add(executor.submit(() -> register(event)));
            var receipts=new ArrayList<Receipt>();
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);
            for(var future:futures) receipts.add(future.get(Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS));
            return receipts;
        } catch(ExecutionException e) {
            if(e.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException("Lote parcial; reintentar con mismos IDs",e);
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Lote interrumpido; reintentar",e);
        } catch(TimeoutException e) { throw new IllegalStateException("Timeout de lote; reintentar con mismos IDs",e); }
        finally { futures.forEach(f -> { if(!f.isDone()) f.cancel(true); }); }
    }
    public DruidAnalytics.Projection reconcile(LocalDate day) {
        if(day.isBefore(LocalDate.of(2000,1,1)) || day.isAfter(LocalDate.now(ZoneOffset.UTC))) throw new IllegalArgumentException("Día fuera de rango");
        if(!reconcileSlot.tryAcquire()) throw new RejectedExecutionException("Otra reconciliación en curso");
        var lock=projectionLock.writeLock();
        boolean acquired=false;
        try {
            acquired=lock.tryLock(10,TimeUnit.SECONDS);
            if(!acquired) throw new RejectedExecutionException("Escrituras activas; reintentar reconciliación");
            return analytics.replace(day,store.day(day,10000));
        } catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("Reconciliación interrumpida",e); }
        finally { if(acquired) lock.unlock(); reconcileSlot.release(); }
    }
    public List<EnvironmentalEvent> history(UUID report,Instant from,Instant to,int limit) {
        range(from,to);
        if(limit<1||limit>500) throw new IllegalArgumentException("limit debe estar entre 1 y 500");
        return store.history(report,from,to,limit);
    }
    public static void range(Instant from,Instant to) {
        if(from==null||to==null||!from.isBefore(to)||Duration.between(from,to).compareTo(Duration.ofDays(366))>0)
            throw new IllegalArgumentException("Rango [from,to) obligatorio, máximo 366 días");
    }
    public static void hourRange(Instant from,Instant to) {
        range(from,to);
        if(from.getNano()!=0 || to.getNano()!=0 || Math.floorMod(from.getEpochSecond(),3600)!=0 || Math.floorMod(to.getEpochSecond(),3600)!=0)
            throw new IllegalArgumentException("Indicadores requieren límites de hora UTC por el rollup HOUR");
    }
}
