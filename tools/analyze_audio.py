"""Extract real audio features. Requires ffmpeg, ffprobe and numpy; no model/API."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def normalize(values):
    values = np.asarray(values, dtype=float)
    ceiling = np.percentile(values, 98) if values.size else 0
    return np.clip(values / ceiling, 0, 1) if ceiling > 1e-12 else np.zeros_like(values)


def extract(samples, rate=16000, feature_rate=20):
    hop, window = round(rate / feature_rate), 2048
    feature_rate = rate / hop
    centers = np.arange(0, len(samples), hop)
    padded = np.pad(samples, (window // 2, window // 2))
    frames = np.stack([padded[i:i + window] for i in centers])
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(window), axis=1))
    frequencies = np.fft.rfftfreq(window, 1 / rate)
    envelope = normalize(np.sqrt(np.mean(frames * frames, axis=1)))
    low = normalize(np.sqrt(np.mean(spectrum[:, (frequencies >= 30) & (frequencies < 250)] ** 2, axis=1)))
    high = normalize(np.sqrt(np.mean(spectrum[:, frequencies >= 2000] ** 2, axis=1)))
    flux = np.maximum(0, np.diff(np.log1p(spectrum), axis=0, prepend=np.zeros((1, spectrum.shape[1])))).mean(axis=1)
    onsets = normalize(flux)
    # ponytail: autocorrelation produces tempo hypotheses; a human must verify meter and downbeats.
    centered = onsets - onsets.mean()
    correlation = np.correlate(centered, centered, mode="full")[len(centered) - 1:]
    candidates = []
    for lag in range(max(1, round(feature_rate * 60 / 200)), min(len(correlation), round(feature_rate * 60 / 65) + 1)):
        if correlation[lag] >= correlation[max(1, lag - 1):min(len(correlation), lag + 2)].max():
            score = max(0.0, float(correlation[lag] / max(correlation[0], 1e-12)))
            if score <= .01:
                continue
            adjustment = 0.0
            if 0 < lag < len(correlation) - 1:
                denominator = correlation[lag - 1] - 2 * correlation[lag] + correlation[lag + 1]
                if abs(denominator) > 1e-12:
                    adjustment = float(np.clip(.5 * (correlation[lag - 1] - correlation[lag + 1]) / denominator, -.5, .5))
            candidates.append({"bpm": round(60 * feature_rate / (lag + adjustment), 3), "score": round(score, 4)})
    candidates = sorted(candidates, key=lambda item: item["score"], reverse=True)[:5]
    beat_candidates = []
    if candidates and candidates[0]["score"] > 0:
        period = 60 / candidates[0]["bpm"]
        phases = np.arange(0, period, 1 / feature_rate)
        scores = [sum(np.interp(np.arange(phase, len(samples) / rate, period), centers / rate, onsets)) for phase in phases]
        phase = float(phases[np.argmax(scores)])
        beat_candidates = np.arange(phase, len(samples) / rate, period).round(4).tolist()
    peaks = [round(float(centers[i] / rate), 4) for i in range(1, len(onsets) - 1)
             if onsets[i] >= .35 and onsets[i] > onsets[i - 1] and onsets[i] >= onsets[i + 1]]
    return {"duration": round(len(samples) / rate, 6), "sampleRate": rate, "featureRate": feature_rate,
            "times": (centers / rate).round(4).tolist(),
            **{name: values.round(5).tolist() for name, values in
               [("envelope", envelope), ("low", low), ("high", high), ("onsets", onsets)]},
            "onsetTimes": peaks, "bpmCandidates": candidates, "beatCandidates": beat_candidates,
            "timingStatus": "automatically-detected-unverified",
            "notes": "Features use decoded local audio. BPM and beat candidates require manual listening; they are not verified downbeats."}


def self_test():
    rate = 16000
    samples = np.zeros(rate * 12, dtype=np.float32)
    pulse = np.sin(2 * np.pi * 160 * np.arange(800) / rate) * np.hanning(800)
    for position in np.arange(.5, 12, .5):
        start = round(position * rate)
        samples[start:start + len(pulse)] += pulse
    result = extract(samples)
    assert result["duration"] == 12
    assert len(result["envelope"]) == 240
    assert any(abs(candidate["bpm"] - 120) < 1 for candidate in result["bpmCandidates"]), result["bpmCandidates"]
    assert all(0 <= value <= 1 for value in result["envelope"])
    silent = extract(np.zeros(rate))
    assert not any(silent["envelope"]) and not silent["bpmCandidates"]
    print("Audio analysis self-test passed: synthetic 120 BPM impulses and silence.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, help="Local audio/video file")
    parser.add_argument("-o", "--output", type=Path, default=ROOT / "data/audio_features.json")
    parser.add_argument("--feature-rate", type=int, default=20)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.input or not args.input.is_file():
        parser.error("Supply an existing local audio/video file.")
    if not 5 <= args.feature_rate <= 60:
        parser.error("--feature-rate must be between 5 and 60.")
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        parser.error("ffmpeg and ffprobe must be on PATH.")
    probe = json.loads(subprocess.check_output([ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(args.input)]))
    if not any(stream.get("codec_type") == "audio" for stream in probe["streams"]):
        parser.error("The selected file has no audio stream.")
    decoded = subprocess.run([ffmpeg, "-v", "error", "-i", str(args.input), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"], capture_output=True, check=True)
    samples = np.frombuffer(decoded.stdout, dtype="<f4")
    if not samples.size or not np.isfinite(samples).all():
        parser.error("Decoded audio is empty or non-finite.")
    result = extract(samples, feature_rate=args.feature_rate)
    with args.input.open("rb") as audio_file:
        digest = hashlib.file_digest(audio_file, "sha256").hexdigest()
    result.update({"schemaVersion": 1, "source": args.input.name, "sourceSha256": digest})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {args.output}: {result['duration']:.3f} s, {len(result['times'])} feature frames. Tempo/beat candidates remain unverified.")


if __name__ == "__main__":
    main()
