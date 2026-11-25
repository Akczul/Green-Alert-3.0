FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock && useradd --uid 10001 --create-home analytics
COPY greenalert_analytics ./greenalert_analytics
COPY scripts ./scripts
COPY tests ./tests
COPY pytest.ini .
USER 10001
EXPOSE 8000
CMD ["uvicorn", "greenalert_analytics.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
