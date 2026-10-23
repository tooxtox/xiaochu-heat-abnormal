"""Extract synchronized highlights from a finished movie; V4 defaults are preserved.

Requires FFmpeg and FFprobe on PATH; Python dependencies are standard-library only.
The input is decoded media, never the animation source or its renderer.
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STARTS = (12.7, 65.7, 144.5, 166.2, 219.2, 228.5)
CLIP_SECONDS = 5
FPS = 60
TOTAL_SECONDS = len(STARTS) * CLIP_SECONDS
TOTAL_FRAMES = TOTAL_SECONDS * FPS


def project_path(value):
    path = Path(value).expanduser()
    return (ROOT / path).resolve() if not path.is_absolute() else path.resolve()


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True,
                            encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} exited {result.returncode}: '
                           f'{result.stderr[-6000:].strip()}')
    return result.stdout


def probe(tool, path, count_frames=False):
    args = [tool, '-v', 'error', '-threads', '4']
    if count_frames:
        args += ['-count_frames']
    args += ['-show_streams', '-show_format', '-of', 'json', str(path)]
    return json.loads(run(args))


def rate(stream):
    try:
        return float(Fraction(stream.get('avg_frame_rate', '0/1')))
    except (ValueError, ZeroDivisionError):
        return 0.0


def stream_duration(stream, metadata):
    return float(stream.get('duration') or metadata.get('format', {}).get('duration') or 0)


def parse_starts(value):
    try:
        starts = tuple(float(item) for item in value.replace(',', ' ').split())
    except ValueError as error:
        raise argparse.ArgumentTypeError('Use comma-separated nonnegative seconds.') from error
    if not starts or any(not math.isfinite(start) or start < 0 for start in starts):
        raise argparse.ArgumentTypeError('Supply at least one finite nonnegative start time.')
    return starts


def graph(starts=STARTS, clip_seconds=CLIP_SECONDS, fps=FPS):
    count = len(starts)
    filters = [f'[0:v:0]split={count}' + ''.join(f'[v{i}]' for i in range(count)),
               f'[0:a:0]asplit={count}' + ''.join(f'[a{i}]' for i in range(count))]
    for index, start in enumerate(starts):
        end = start + clip_seconds
        filters += [f'[v{index}]trim=start={start:.3f}:end={end:.3f},'
                    f'setpts=PTS-STARTPTS[vt{index}]',
                    f'[a{index}]atrim=start={start:.3f}:end={end:.3f},'
                    f'asetpts=PTS-STARTPTS[at{index}]']
    filters += [''.join(f'[vt{i}][at{i}]' for i in range(count)) +
                f'concat=n={count}:v=1:a=1[vc][ac]',
                f'[vc]fps={fps},format=yuv420p[vout]',
                '[ac]aresample=48000:async=0[aout]']
    return ';'.join(filters)


def self_test():
    assert 'split=6[v0]' in graph() and 'concat=n=6:v=1:a=1' in graph()
    assert 'trim=start=12.700:end=17.700' in graph()
    starts = parse_starts('3,29.73,46.71,62.46,84.75,112.73,123.36,194.28,209.99,212.57,225.88')
    custom = graph(starts, 3, FPS)
    assert len(starts) == 11 and len(starts)*3*FPS == 1980
    assert 'split=11[v0]' in custom and 'concat=n=11:v=1:a=1' in custom
    assert 'trim=start=225.880:end=228.880' in custom
    assert 'atrim=start=225.880:end=228.880' in custom
    for value in ('', '-1', 'nan', '1,inf'):
        try:
            parse_starts(value)
        except argparse.ArgumentTypeError:
            continue
        raise AssertionError(f'Invalid starts accepted: {value}')
    print('Highlight parameter self-test passed: V4 defaults,11×3-second A/V graph,invalid input rejection. No media read.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', default='export/LAST-SIGNAL-1080p60-v4.mp4',
                        help='Finished movie; relative paths resolve from the project folder.')
    parser.add_argument('--output', default='export/v4-motion-highlights.mp4',
                        help='Output MP4; the adjacent .qa.json contains validation results.')
    parser.add_argument('--starts', type=parse_starts, default=STARTS,
                        help='Comma-separated source starts in seconds; default keeps the six V4 ranges.')
    parser.add_argument('--clip-seconds', type=float, default=CLIP_SECONDS,
                        help='Length of each excerpt; must contain an integer number of 60 fps frames.')
    parser.add_argument('--revision', default='v4-motion-highlights',
                        help='Revision label written into the QA report; set explicitly for later movies.')
    parser.add_argument('--self-test', action='store_true',
                        help='Check parameter handling and filter graphs without reading media.')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if (not math.isfinite(args.clip_seconds) or args.clip_seconds <= 0 or
            abs(args.clip_seconds*FPS-round(args.clip_seconds*FPS)) > 1e-6):
        parser.error('--clip-seconds must be positive and contain whole 60 fps frames.')
    if not args.revision.strip():
        parser.error('--revision must be a nonempty label.')
    starts, clip_seconds = args.starts, args.clip_seconds
    clip_frames = round(clip_seconds*FPS)
    total_frames = len(starts)*clip_frames
    total_seconds = total_frames/FPS
    source, output = project_path(args.input), project_path(args.output)
    if source == output:
        parser.error('Input and output must be different files.')
    report_path = output.with_suffix('.qa.json')
    report = {
        'schemaVersion': 1, 'revision': args.revision,
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': str(source), 'output': str(output),
        'sourceSha256': None, 'expected': {
            'width': 1920, 'height': 1080, 'fps': FPS, 'frames': total_frames,
            'durationSeconds': total_seconds, 'videoCodec': 'h264',
            'pixelFormat': 'yuv420p', 'audioCodec': 'aac',
            'audioSampleRate': 48000, 'audioChannels': 2,
        },
        'clips': [
            {'index': i + 1, 'sourceStartSeconds': start,
             'sourceEndSeconds': start + clip_seconds,
             'outputStartSeconds': i * clip_seconds,
             'outputEndSeconds': (i + 1) * clip_seconds,
             'expectedFrames': clip_frames}
            for i, start in enumerate(starts)
        ],
        'method': 'One FFmpeg graph: split/asplit, matching trim/atrim and '
                  'setpts/asetpts per segment, interleaved A/V concat; one final '
                  'H.264 and AAC encoding. No separately encoded AAC joins.',
        'encoding': {'video': 'libx264', 'crf': 18, 'preset': 'fast',
                     'encoderThreads': 4, 'filterThreads': 2,
                     'audioBitrate': '320k', 'audioRate': 48000,
                     'audioChannels': 2},
        'limits': [
            f'Only these {len(starts)} excerpts of {clip_seconds:g} seconds are included; this is not a full-song review.',
            'Media is decoded from the final MP4 and re-encoded once; source compressed '
            'video/audio packets are not preserved bit for bit.',
            'Matching segment timelines preserve existing source A/V alignment; this '
            'does not independently certify vocal, lyric or beat alignment.',
            'FFprobe decodes the highlight streams to count video frames; this does '
            'not replace visual inspection or flash screening.',
        ],
        'checks': {}, 'passed': False,
    }
    try:
        ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
        if not ffmpeg or not ffprobe:
            raise RuntimeError('FFmpeg and FFprobe must both be available on PATH.')
        if not source.is_file():
            raise FileNotFoundError(f'Finished source movie not found: {source}')
        initial_stat = source.stat()
        report['sourceSha256'] = sha256(source)
        metadata = probe(ffprobe, source)
        video = next((s for s in metadata['streams'] if s['codec_type'] == 'video'), {})
        audio = next((s for s in metadata['streams'] if s['codec_type'] == 'audio'), {})
        source_ok = (video.get('width') == 1920 and video.get('height') == 1080 and
                     abs(rate(video) - FPS) < 1e-6 and bool(audio) and
                     stream_duration(video, metadata) >= max(starts) + clip_seconds and
                     stream_duration(audio, metadata) >= max(starts) + clip_seconds)
        report['checks']['source'] = {
            'passed': source_ok, 'width': video.get('width'),
            'height': video.get('height'), 'fps': rate(video),
            'videoDurationSeconds': stream_duration(video, metadata),
            'audioDurationSeconds': stream_duration(audio, metadata),
            'audioPresent': bool(audio),
        }
        if not source_ok:
            raise ValueError('Source must contain finished 1920×1080/60 fps video and '
                             'audio covering every requested clip range.')
        output.parent.mkdir(parents=True, exist_ok=True)
        command = [
            ffmpeg, '-hide_banner', '-loglevel', 'warning', '-nostdin', '-y',
            '-threads', '4', '-i', str(source), '-filter_complex_threads', '2',
            '-filter_complex', graph(starts, clip_seconds, FPS), '-map', '[vout]', '-map', '[aout]',
            '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'fast',
            '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '4',
            '-fps_mode', 'cfr', '-c:a', 'aac', '-b:a', '320k',
            '-ar', '48000', '-ac', '2', '-t', str(total_seconds),
            '-movflags', '+faststart', str(output),
        ]
        report['filterGraph'] = graph(starts, clip_seconds, FPS)
        run(command)
        encoded = probe(ffprobe, output, count_frames=True)
        video = next((s for s in encoded['streams'] if s['codec_type'] == 'video'), {})
        audio = next((s for s in encoded['streams'] if s['codec_type'] == 'audio'), {})
        actual = {
            'width': video.get('width'), 'height': video.get('height'),
            'fps': rate(video), 'decodedFrames': int(video.get('nb_read_frames') or 0),
            'metadataFrames': int(video.get('nb_frames') or 0),
            'durationSeconds': float(encoded.get('format', {}).get('duration') or 0),
            'videoDurationSeconds': stream_duration(video, encoded),
            'videoCodec': video.get('codec_name'), 'pixelFormat': video.get('pix_fmt'),
            'audioPresent': bool(audio), 'audioCodec': audio.get('codec_name'),
            'audioSampleRate': int(audio.get('sample_rate') or 0),
            'audioChannels': audio.get('channels'),
            'audioDurationSeconds': stream_duration(audio, encoded),
        }
        passed = (actual['width'] == 1920 and actual['height'] == 1080 and
                  abs(actual['fps'] - FPS) < 1e-6 and
                  actual['decodedFrames'] == total_frames and
                  actual['metadataFrames'] == total_frames and
                  abs(actual['durationSeconds'] - total_seconds) <= 1 / FPS and
                  abs(actual['videoDurationSeconds'] - total_seconds) <= 1 / FPS and
                  actual['videoCodec'] == 'h264' and actual['pixelFormat'] == 'yuv420p' and
                  actual['audioPresent'] and actual['audioCodec'] == 'aac' and
                  actual['audioSampleRate'] == 48000 and actual['audioChannels'] == 2 and
                  abs(actual['audioDurationSeconds'] - total_seconds) <= 1 / FPS)
        report['checks']['encoding'] = {'passed': passed, **actual}
        final_stat = source.stat()
        unchanged = (initial_stat.st_size == final_stat.st_size and
                     initial_stat.st_mtime_ns == final_stat.st_mtime_ns)
        report['checks']['sourceStableDuringExtraction'] = {'passed': unchanged}
        report['outputSha256'] = sha256(output)
        report['passed'] = passed and unchanged
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        report['error'] = str(error)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'output': str(output),
                      'qa': str(report_path), 'error': report.get('error')}, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
