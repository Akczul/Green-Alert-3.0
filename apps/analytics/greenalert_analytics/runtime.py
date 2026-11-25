import asyncio
import multiprocessing
from concurrent.futures import ProcessPoolExecutor


class ServiceError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


class ComputeRuntime:
    """Sin cola ilimitada. Un timeout HTTP conserva el cupo hasta terminar el hijo."""
    def __init__(self, settings):
        self.pool = ProcessPoolExecutor(max_workers=settings.cpu_workers,
                                       mp_context=multiprocessing.get_context("spawn"))
        self.slots = asyncio.Semaphore(settings.max_cpu_jobs)
        self.timeout = settings.compute_timeout_seconds

    async def execute(self, function, *args):
        try:
            await asyncio.wait_for(self.slots.acquire(), timeout=0.05)
        except TimeoutError:
            raise ServiceError(429, "COMPUTE_BUSY", "Capacidad de cálculo ocupada; reintente más tarde")
        try:
            future = asyncio.get_running_loop().run_in_executor(self.pool, function, *args)
        except BaseException:
            self.slots.release()
            raise

        def finished(task):
            self.slots.release()
            # Consumir excepciones aun cuando el cliente ya haya cancelado.
            if not task.cancelled():
                task.exception()

        future.add_done_callback(finished)
        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=self.timeout)
        except TimeoutError:
            raise ServiceError(504, "COMPUTE_TIMEOUT", "Cálculo excedió el tiempo permitido; no se guardó resultado")
        except ValueError as exc:
            raise ServiceError(422, "INVALID_ANALYSIS", str(exc)) from None

    def close(self):
        self.pool.shutdown(wait=True, cancel_futures=True)
