FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy application source
COPY src/ src/
COPY ui/ ui/
COPY config.yml .

CMD ["python", "-m", "src"]
