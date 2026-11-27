# Serveur de synthèse vocale Piper (gratuit, open source, licence GPL) avec des voix françaises.
FROM python:3.12-slim
RUN pip install --no-cache-dir "piper-tts==1.8.0" flask
WORKDIR /voices
# Voix françaises téléchargées à la construction de l'image (depuis huggingface.co/rhasspy/piper-voices).
ARG VOICES="fr_FR-siwis-medium fr_FR-upmc-medium fr_FR-tom-medium fr_FR-gilles-low fr_FR-mls-medium"
RUN for v in $VOICES; do python -m piper.download_voices --download-dir /voices "$v" || echo "Voix $v indisponible, ignorée"; done
EXPOSE 5000
CMD ["python", "-m", "piper.http_server", "-m", "fr_FR-siwis-medium", "--data-dir", "/voices", "--host", "0.0.0.0", "--port", "5000"]
