#!/usr/bin/env python3
"""One-shot research transcriber of the already public 120s source MP4.

Never changes the original media, app UI, or collector event clocks.
This script is deliberately NOT in production release CI; remove its
temporary GitHub workflow before merging any public demo update.
"""
import hashlib
import json
import pathlib

from faster_whisper import WhisperModel

source = pathlib.Path("streaming-demo/assets/nov17-participation.mp4")
assert source.is_file() and source.stat().st_size == 10403588, "Missing or changed original source"
audio_sha = hashlib.sha256(source.read_bytes()).hexdigest()
# PyAV is already installed by faster-whisper. No host ffprobe binary
# or system package manager is needed for this bounded source probe.
import av
with av.open(str(source)) as original:
    duration = float(original.duration / 1000000)
assert 118 <= duration <= 122, f"Unexpected original media duration: {duration}"
model_name = "small"
model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=4)
segments, info = model.transcribe(
    str(source), beam_size=5, best_of=5, task="transcribe",
    vad_filter=False, condition_on_previous_text=False, word_timestamps=False,
)
rows = []
for seg in segments:
    start = float(seg.start)
    end = float(seg.end)
    words = str(seg.text).strip()
    if not words:
        continue
    assert 0 <= start < end <= duration + 1.0, "ASR source-local timing invalid"
    rows.append([round(start, 3), round(end, 3), words])
assert len(rows) >= 2, "Insufficient actual transcript output"
out = {
    "schema": "hl-source-asr-public-v1",
    "captureId": "nov17-participation",
    "media": "assets/nov17-participation.mp4",
    "mediaSha256": audio_sha,
    "mediaDurationSeconds": round(duration, 3),
    "clock": "SOURCE_MEDIA_LOCAL_UNCALIBRATED_TO_COLLECTOR",
    "model": "faster-whisper/small",
    "language": info.language,
    "languageProbability": round(float(info.language_probability), 4),
    "humanReviewed": False,
    "utterances": rows,
}
path = pathlib.Path("nov17-participation-asr-candidate.json")
path.write_text(json.dumps(out, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print("SOURCE_ASR_CANDIDATE_START")
print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print("SOURCE_ASR_CANDIDATE_END")
print("ASR_SOURCE_PROOF", json.dumps({"mediaSha256": audio_sha,
   "sourceSeconds": round(duration, 3), "utterances": len(rows)}))
