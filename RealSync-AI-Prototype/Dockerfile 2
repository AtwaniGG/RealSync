FROM python:3.11-slim

# Install OpenCV system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# H14: Set HF_HOME so DeBERTa cache is accessible after user switch
ENV HF_HOME=/app/.cache/huggingface

# Pre-download DeBERTa model during build to avoid runtime download
RUN python -c "from transformers import pipeline; pipeline('zero-shot-classification', model='MoritzLaurer/deberta-v3-base-zeroshot-v2.0')"

RUN useradd --create-home appuser && chown -R appuser:appuser /app

COPY . .
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5100/api/health')" || exit 1

CMD ["python", "-m", "serve.app"]
