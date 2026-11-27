# Transcription vocale locale et gratuite (faster-whisper, licence MIT).
FROM python:3.12-slim
RUN pip install --no-cache-dir "faster-whisper==1.2.1" flask
WORKDIR /app
COPY server.py .
# Modèle : tiny, base, small (bon compromis en français sur CPU), medium, large-v3.
ENV WHISPER_MODEL=small
# Télécharge le modèle à la construction de l'image (depuis Hugging Face).
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"
EXPOSE 5001
CMD ["python", "server.py"]
