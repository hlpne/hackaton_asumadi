FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /project
COPY backend/requirements.txt /project/backend/requirements.txt
RUN pip install --no-cache-dir -r /project/backend/requirements.txt
COPY backend/app /project/backend/app
COPY mock_data /project/mock_data
RUN useradd --create-home --uid 10001 appuser
USER appuser
WORKDIR /project/backend
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
