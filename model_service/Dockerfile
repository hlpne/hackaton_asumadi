FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TRAM_DATA=/model/data
WORKDIR /model
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY model_service/requirements.txt /model/requirements.txt
RUN pip install --no-cache-dir -r /model/requirements.txt
COPY model_service /model/service
COPY tram_final/tram_final/artifacts/*.txt /model/artifacts/
COPY tram_final/tram_final/artifacts/manifest.json /model/artifacts/manifest.json
COPY tram_final/tram_final/src/tram_ml/v4.py /model/tram_ml/v4.py
COPY tram_final/tram_final/src/tram_ml/assets/weather.json /model/tram_ml/assets/weather.json
COPY data/labels/labels_day_train.csv data/labels/labels_day_test.csv /model/data/labels/
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /model
USER appuser
EXPOSE 8080
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8080"]
