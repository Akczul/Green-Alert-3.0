import asyncio
import time
from types import SimpleNamespace

import pytest

from greenalert_analytics.runtime import ComputeRuntime, ServiceError


@pytest.mark.asyncio
async def test_timeout_retains_capacity_until_process_finishes():
    runtime = ComputeRuntime(SimpleNamespace(cpu_workers=1, max_cpu_jobs=1, compute_timeout_seconds=.01))
    try:
        with pytest.raises(ServiceError) as timeout:
            await runtime.execute(time.sleep, .5)
        assert timeout.value.status == 504
        with pytest.raises(ServiceError) as busy:
            await runtime.execute(time.sleep, 0)
        assert busy.value.status == 429
        # Esperar únicamente a nuestro hijo, sin asumir tiempo de arranque en CI.
        for _ in range(100):
            if not runtime.slots.locked():
                break
            await asyncio.sleep(.05)
        assert not runtime.slots.locked()
    finally:
        runtime.close()
