# --- Stage 1: frontend build ---
FROM node:20-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend runtime ---
FROM python:3.12-slim AS runtime
WORKDIR /app

# CPU-only torch: Railway has no GPU, and the project's own
# requirements.txt points at the CUDA (cu128) wheel index for local GPU
# development. Installing the CPU wheel keeps the image small and avoids
# a CUDA-driver dependency that would never be satisfied here.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY backend/requirements.txt /tmp/requirements.txt
RUN grep -v -E '^(--extra-index-url|torch$)' /tmp/requirements.txt > /tmp/requirements-docker.txt \
    && pip install --no-cache-dir -r /tmp/requirements-docker.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /src/frontend/dist/ /app/frontend/dist/

# Piri-veriler/ ships in the image as a read-only seed; entrypoint.sh
# copies it onto the persistent volume on first boot (see entrypoint.sh
# for why it can't just live under /data directly).
COPY Piri-veriler/ /app/Piri-veriler-seed/

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Cache the embedding model (~2GB download from HuggingFace Hub) on the
# persistent volume so it survives restarts/redeploys instead of
# re-downloading every time the container starts fresh.
ENV HF_HOME=/data/hf_cache

ENTRYPOINT ["/app/entrypoint.sh"]
