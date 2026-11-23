"""Verify and assemble the SHA-pinned original commercial video from Git blobs.

One-time CI staging mechanism. This is not transcoding or a replacement
recording. It concatenates binary pieces of the same exact ffprobe-verified
H.264/AAC MP4. No network, R2, ASR, model calls or user data changes.
"""
from __future__ import annotations

from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess

ROOT = Path("streaming-demo/nine-tickers")
PIECES = ROOT / ".video-parts"
OUTPUT = ROOT / "commercial-180.mp4"
EXPECTED = "9fdbdff777391886cfc39b220a053f3e10a49dd72454fe14d7443aacc0176f92"
COUNT = 19
PART_SIZE = 765000
FINAL_SIZE = 273262
TOTAL = 14043262


def run() -> dict:
    manifest = json.loads((ROOT/"video-manifest.json").read_text())
    if (manifest.get("schema")!="hl-commercial-video-source-v1"
        or manifest.get("mp4Sha256")!=EXPECTED
        or manifest.get("mp4Bytes")!=TOTAL
        or manifest.get("sourcePartSha256")!="58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de"
        or manifest.get("originalAudioIncluded") is not True):
        raise ValueError("assembled_video_contract_wrong")
    parts=sorted(PIECES.glob("segment-*.bin"))
    if len(parts)!=COUNT or {p.name for p in parts}!={f"segment-{i:02d}.bin" for i in range(COUNT)}:
        raise ValueError("assembled_video_missing_source_parts")
    temp=ROOT/"commercial-180.mp4.part"
    if temp.exists() or OUTPUT.exists():
        raise ValueError("assembled_video_refuses_overwrite")
    digest=sha256()
    total=0
    try:
        with temp.open("xb") as output:
            for i,part in enumerate(parts):
                size=part.stat().st_size
                if part.is_symlink() or size!=(FINAL_SIZE if i==COUNT-1 else PART_SIZE):
                    raise ValueError(f"assembled_video_part_size_invalid: part={i:02d}, bytes={size}")
                with part.open("rb") as source:
                    while True:
                        chunk=source.read(1024*1024)
                        if not chunk:break
                        digest.update(chunk)
                        output.write(chunk)
                        total+=len(chunk)
                if total>TOTAL:
                    raise ValueError("assembled_video_excess_bytes")
        if total!=TOTAL or digest.hexdigest()!=EXPECTED:
            raise ValueError("assembled_video_digest_failed")
        with temp.open("rb") as f:
            header=f.read(24)
        if header[4:8]!=b"ftyp":
            raise ValueError("assembled_video_not_mp4")
        # The source export independently checked H.264, AAC and 180s;
        # repeat those probes where an ffprobe binary is present.
        probe=subprocess.run(["ffprobe","-v","error",
                              "-show_entries","format=duration:stream=codec_type,codec_name",
                              "-of","json",str(temp)],
                             capture_output=True,text=True,check=True,timeout=25)
        metadata=json.loads(probe.stdout)
        kinds={(x.get("codec_type"),x.get("codec_name")) for x in metadata.get("streams",[])}
        dur=float(metadata["format"]["duration"])
        if not 178.8<=dur<=181.0 or ("video","h264") not in kinds or ("audio","aac") not in kinds:
            raise ValueError("assembled_video_stream_validation_failed")
        os.replace(temp,OUTPUT)
    finally:
        temp.unlink(missing_ok=True)
    return {"status":"VERIFIED_ORIGINAL_VIDEO_ASSEMBLED", "bytes":total,
            "sha256":EXPECTED, "durationSeconds":round(dur,3),
            "sourcePartSha256":manifest["sourcePartSha256"],
            "containsVideoAndAudio":True}


if __name__=="__main__":
    print(json.dumps(run(),sort_keys=True))
