"""Service de transcription local et gratuit (faster-whisper).

POST /transcribe?language=fr  — corps : un fichier WAV
Réponse : {"text": "..."}
"""
import io
import os

from faster_whisper import WhisperModel
from flask import Flask, jsonify, request

MODEL = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

app = Flask(__name__)
model = WhisperModel(MODEL, device=DEVICE, compute_type=COMPUTE)


@app.get("/health")
def health():
    return jsonify({"ok": True, "model": MODEL})


@app.post("/transcribe")
def transcribe():
    audio = request.get_data()
    if not audio:
        return jsonify({"error": "aucun audio"}), 400
    language = request.args.get("language", "fr")
    # Le filtre VAD retire les silences et évite les « hallucinations » sur du bruit.
    segments, _ = model.transcribe(
        io.BytesIO(audio),
        language=language,
        vad_filter=True,
        beam_size=1,
        condition_on_previous_text=False,
    )
    text = " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6).strip()
    return jsonify({"text": text})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5001")))
