FROM python:3.11-slim

# Install OpenCV system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Set HF cache dir so models persist after user switch
ENV HF_HOME=/app/.cache/huggingface

# Pre-download CLIP deepfake model during build to avoid runtime download (~1.2GB)
RUN python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='yermandy/deepfake-detection', filename='model.torchscript')"

RUN useradd --create-home appuser && chown -R appuser:appuser /app

COPY . .
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5100}/api/health || exit 1

CMD ["python", "-m", "serve.app"]
