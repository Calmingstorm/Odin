FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy application source
COPY src/ src/
COPY ui/ ui/

# Working directory for local user commands (tools.local_working_dir).
# Deliberately OUTSIDE the install root (/app here) and outside the data dir:
# local commands run here so a bare relative path — e.g. cleaning up after
# extracting an archive whose internal layout starts with data/ — cannot
# resolve against the live install. Validation fails closed if it is missing
# or not 0700, so this must exist in the image.
RUN mkdir -p /var/lib/odin-workspace && chmod 0700 /var/lib/odin-workspace
COPY config.yml .

CMD ["python", "-m", "src"]
