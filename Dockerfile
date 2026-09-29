FROM python:3.12-slim

WORKDIR /app

# Include source in the distribution so console entrypoints work outside /app.
COPY pyproject.toml .
COPY src/ src/
# .[pdf] — analyze_pdf needs PyMuPDF; without it the catalog gate hides the
# tool, so an official image would ship without a capability it advertises.
RUN pip install --no-cache-dir ".[pdf,browser]"
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright
COPY scripts/install-browser-runtime.sh /app/install-browser-runtime.sh
RUN sh /app/install-browser-runtime.sh python --with-deps

# Copy application source
COPY ui/ ui/
COPY scripts/docker-compose-entrypoint.sh /app/docker-compose-entrypoint.sh

# Working directory for local user commands (tools.local_working_dir).
# Deliberately OUTSIDE the install root (/app here) and outside the data dir:
# local commands run here so a bare relative path — e.g. cleaning up after
# extracting an archive whose internal layout starts with data/ — cannot
# resolve against the live install. Validation fails closed if it is missing
# or not 0700, so this must exist in the image.
RUN mkdir -p /var/lib/odin-workspace && chmod 0700 /var/lib/odin-workspace
COPY config.yml .

CMD ["python", "-m", "src"]
