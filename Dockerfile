# Multi-stage or lean production Dockerfile for Notice to Action FastAPI Backend
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    DISABLE_SQLALCHEMY_C_EXTENSIONS=1

WORKDIR /app

# Install minimal OS dependencies for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt

# Copy application source modules
COPY backend ./backend
COPY extraction ./extraction
COPY validation ./validation
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY pyproject.toml ./pyproject.toml

# Create unprivileged application user & private storage directory
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/uploads && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Health check verifies /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start command: safely applies Alembic migrations before binding Uvicorn
CMD ["sh", "-c", "python -m alembic upgrade head && uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}"]
