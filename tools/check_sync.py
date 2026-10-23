"""Check encoded audio timing against the exact selected source, not lyrics/vocals."""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RATE = 8000


def decode(path, start, duration):
    result = subprocess.run([
        'ffmpeg', '-v', 'error', '-i', str(path), '-ss', str(start), '-t', str(duration),
        '-map', '0:a:0', '-vn', '-ac', '1', '-ar', str(RATE), '-f', 'f32le', 'pipe:1',
    ], capture_output=True, check=True)
    audio = np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)
    if not audio.size or not np.isfinite(audio).all():
        raise ValueError(f'Invalid decoded audio: {path}')
    return audio


def estimate_lag(reference, padded_output, radius, rate=RATE):
    """Normalized valid correlation. Positive lag means output audio is delayed."""
    n, m = len(reference), len(padded_output)
    if m < n or n < 10:
        raise ValueError('Output correlation window is shorter than reference.')
    reference = reference - reference.mean()
    norm = np.linalg.norm(reference)
    if norm < 1e-8:
        raise ValueError('Reference window is silent.')
    size = 1 << (m + n - 2).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(padded_output, size) *
                               np.fft.rfft(reference[::-1], size), size)[n-1:m]
    sums = np.r_[0., np.cumsum(padded_output)]
    squares = np.r_[0., np.cumsum(padded_output ** 2)]
    energy = squares[n:] - squares[:-n] - (sums[n:] - sums[:-n]) ** 2 / n
    coefficients = correlation / np.maximum(norm * np.sqrt(np.maximum(energy, 0)), 1e-12)
    peak = int(np.argmax(coefficients))
    return {'lag_ms': round((peak / rate - radius) * 1000, 4),
            'correlation': round(float(coefficients[peak]), 6),
            'search_boundary_hit': peak in (0, len(coefficients)-1)}


def self_test():
    rng = np.random.default_rng(21)
    track = rng.normal(0, .1, 6 * RATE)
    reference = track[RATE:3*RATE]
    for shift in (0, 184, -184):
        offset = RATE // 2 - shift
        result = estimate_lag(reference, track[offset:offset + 3*RATE], .5)
        assert abs(result['lag_ms'] - shift / RATE * 1000) < .01, result
        assert result['correlation'] > .999, result
    try:
        estimate_lag(np.zeros(100), np.zeros(200), .5)
        raise AssertionError('Silence must not produce a confident sync result.')
    except ValueError:
        pass
    print('Sync self-test passed: exact zero, positive/negative 23 ms offsets, silence rejection.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('movie', nargs='?', type=Path, default=ROOT/'export/LAST-SIGNAL-1080p60-rough-cut.mp4')
    parser.add_argument('--source', type=Path, default=ROOT/'assets/audio/song.m4a')
    parser.add_argument('--output', type=Path, default=ROOT/'export/sync-check.json')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.movie.is_file() or not args.source.is_file():
        parser.error('Movie and exact source audio must both exist.')
    windows, radius, tolerance = [], .5, 1000/60
    for label, start, end in [('start', 4, 16), ('middle', 116, 128), ('end', 224, 236)]:
        reference = decode(args.source, start, end-start)
        output = decode(args.movie, start-radius, end-start+2*radius)
        expected = round((end-start) * RATE)
        if abs(len(reference)-expected) > 2 or abs(len(output)-(expected+RATE)) > 2:
            raise ValueError(f'Incomplete decoded {label} window.')
        result = estimate_lag(reference, output, radius)
        result.update(label=label, source_start_seconds=start, source_end_seconds=end)
        result['passed'] = abs(result['lag_ms']) <= tolerance and result['correlation'] >= .8 and not result['search_boundary_hit']
        windows.append(result)
    report = {
        'schema_version': 1, 'movie': str(args.movie.resolve()), 'source': str(args.source.resolve()),
        'method': '8 kHz mono decoded audio; normalized cross-correlation with ±0.5 second search',
        'positive_lag_means': 'Encoded output audio is delayed relative to the exact source timeline.',
        'tolerance_ms': tolerance, 'minimum_correlation': .8, 'windows': windows,
        'end_minus_start_lag_ms': round(windows[-1]['lag_ms']-windows[0]['lag_ms'],4),
        'passed': all(window['passed'] for window in windows),
        'scope': 'Three source/output audio timing samples only. Does not verify vocal, lyric, beat or animation-event alignment.',
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'passed':report['passed'], 'windows':windows, 'report':str(args.output)}, ensure_ascii=False))
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
