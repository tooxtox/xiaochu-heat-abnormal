"""Extract actual encoded lyric holds in one FFmpeg decode and assemble QA sheets.

Requires FFmpeg/FFprobe on PATH and Pillow. No animation source is re-rendered.
Relative paths resolve from this project's root folder.
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
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FPS = 60
WIDTH, HEIGHT = 1920, 1080


def project_path(value):
    path = Path(value).expanduser()
    return (ROOT / path).resolve() if not path.is_absolute() else path.resolve()


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True,
                            encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} exited {result.returncode}: '
                           f'{result.stderr[-6000:].strip()}')
    return result.stdout


def get_font(size):
    for candidate in ('C:/Windows/Fonts/consola.ttf',
                      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'):
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size=size)


def select_holds(lines):
    selected = []
    for index, line in enumerate(lines):
        start, end = float(line['time']), float(line['end'])
        if not all(math.isfinite(value) for value in (start, end)) or start < 0 or end <= start:
            raise ValueError(f'Invalid interval on lyric line {index + 1}.')
        life = end - start
        # Short repeats still get an in-line hold, even when shorter than 0.25 s.
        offset = min(0.25, life * 0.60) if life < 0.75 else life * 0.60
        requested = start + offset
        first = math.ceil(start * FPS - 1e-8)
        last = math.ceil(end * FPS - 1e-8) - 1
        if first > last:
            raise ValueError(f'Line {index + 1} contains no global 60 fps video frame.')
        frame = max(first, min(last, math.floor(requested * FPS + 0.5)))
        time = frame / FPS
        if time < start - 1e-8 or time >= end:
            raise ValueError(f'Frame selection escaped line {index + 1}.')
        selected.append({
            'lineId': str(line.get('id') or f'L{index + 1:03}'),
            'lineIndex': index, 'lineStartSeconds': start,
            'lineEndSeconds': end, 'lineDurationSeconds': life,
            'requestedTimeSeconds': requested,
            'frameNo': frame, 'frameTimeSeconds': time,
        })
    return selected


def assemble_sheets(selected, frame_paths, export_dir, prefix):
    paths, font, small = [], get_font(15), get_font(12)
    for offset in range(0, len(selected), 16):
        sheet = Image.new('RGB', (1920, 1248), '#090C13')
        draw = ImageDraw.Draw(sheet)
        for local, entry in enumerate(selected[offset:offset + 16]):
            x, y = local % 4 * 480, local // 4 * 312
            with Image.open(frame_paths[entry['frameNo']]) as image:
                if image.size != (WIDTH, HEIGHT):
                    raise ValueError(f'Unexpected extracted image size: {image.size}')
                thumbnail = image.convert('RGB').resize((480, 270), Image.Resampling.LANCZOS)
            sheet.paste(thumbnail, (x, y))
            draw.text((x + 12, y + 277),
                      f"{entry['lineId']} / F{entry['frameNo']} / "
                      f"{entry['frameTimeSeconds']:.3f} s", fill='#9DE4C2', font=font)
            draw.text((x + 12, y + 297),
                      f"LINE {entry['lineStartSeconds']:.3f}.."
                      f"{entry['lineEndSeconds']:.3f} s / ENCODED FRAME",
                      fill='#C8CCD1', font=small)
        target = export_dir / f'{prefix}-encoded-lyrics-{offset // 16 + 1:02}.png'
        sheet.save(target)
        paths.append(str(target.resolve()))
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--movie', default='export/LAST-SIGNAL-1080p60-v5.mp4',
                        help='Finished MP4 to decode once; no source render is invoked.')
    parser.add_argument('--lyrics', default='data/lyrics.json',
                        help='Actual line timing JSON used for the movie.')
    parser.add_argument('--prefix', default='v5',
                        help='Filename prefix for contact sheets, QA and the work directory.')
    args = parser.parse_args()
    if not args.prefix or any(not (ch.isascii() and (ch.isalnum() or ch in '-_'))
                              for ch in args.prefix):
        parser.error('--prefix accepts only ASCII letters, digits, hyphens and underscores.')
    movie, lyric_path = project_path(args.movie), project_path(args.lyrics)
    export_dir = ROOT / 'export'
    export_dir.mkdir(parents=True, exist_ok=True)
    report_path = export_dir / f'{args.prefix}-encoded-lyrics.qa.json'
    report = {
        'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
        'movie': str(movie), 'movieSha256': None,
        'lyrics': str(lyric_path), 'dataHashes': {},
        'selectionMethod': 'Nearest global 60 fps frame to 60% of each lyric interval; '
                           'for intervals shorter than 0.75 s use min(0.25 s, 60% of '
                           'the interval). Clamp to a frame inside [line.time, line.end).',
        'extractionMethod': 'One FFmpeg decode with select=eq(n,...) over deduplicated '
                            'source-frame numbers. JPEG QA frames are not source renders.',
        'limits': [
            'One held encoded frame per line is sampled; entrances, exits and every '
            'intermediate video frame are not exhaustively inspected here.',
            'JPEG extraction and downscaled PNG contact sheets are visual QA copies; '
            'they are not lossless movie-frame archives.',
            'This does not verify vocal/word timing, audio sync or photosensitivity.',
            'The source stream frame count is FFprobe metadata; this tool does not '
            'perform an additional full decoding pass merely to recount all frames.',
        ],
        'checks': {}, 'selections': [], 'contactSheets': [], 'passed': False,
        'visualReview': {'status': 'pending'},
    }
    try:
        ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
        if not ffmpeg or not ffprobe:
            raise RuntimeError('FFmpeg and FFprobe must both be available on PATH.')
        if not movie.is_file() or not lyric_path.is_file():
            raise FileNotFoundError('Finished MP4 and populated lyric JSON must both exist.')
        initial_stat = movie.stat()
        report['movieSha256'] = sha256(movie)
        report['dataHashes'][str(lyric_path)] = sha256(lyric_path)
        direction = ROOT / 'data/lyric_direction.json'
        if direction.is_file():
            report['dataHashes'][str(direction.resolve())] = sha256(direction)
        lyrics = json.loads(lyric_path.read_text(encoding='utf-8-sig'))
        lines = lyrics.get('lines')
        if not isinstance(lines, list) or not lines:
            raise ValueError('Lyric JSON must contain non-empty lines.')
        selected = select_holds(lines)
        metadata = json.loads(run([ffprobe, '-v', 'error', '-show_streams',
                                   '-show_format', '-of', 'json', str(movie)]))
        video = next((s for s in metadata['streams'] if s['codec_type'] == 'video'), {})
        audio = next((s for s in metadata['streams'] if s['codec_type'] == 'audio'), {})
        rate = float(Fraction(video.get('avg_frame_rate', '0/1')))
        duration = float(video.get('duration') or metadata.get('format', {}).get('duration') or 0)
        start = float(video.get('start_time') or 0)
        count = int(video.get('nb_frames') or 0)
        source_ok = (video.get('width') == WIDTH and video.get('height') == HEIGHT and
                     abs(rate - FPS) < 1e-6 and abs(start) < 1e-6 and
                     count > max(entry['frameNo'] for entry in selected) and
                     duration >= max(entry['lineEndSeconds'] for entry in selected) - 1e-6)
        report['checks']['source'] = {
            'passed': source_ok, 'videoCodec': video.get('codec_name'),
            'pixelFormat': video.get('pix_fmt'), 'width': video.get('width'),
            'height': video.get('height'), 'fps': rate,
            'streamMetadataFrameCount': count, 'videoStartSeconds': start,
            'durationSeconds': duration, 'audioPresent': bool(audio),
        }
        if not source_ok:
            raise ValueError('Input must be a finished 1920×1080/60 fps movie starting '
                             'at zero and covering every selected lyric interval.')
        unique_frames = sorted({entry['frameNo'] for entry in selected})
        work_dir = ROOT / 'work' / f'{args.prefix}encoded'
        work_dir.mkdir(parents=True, exist_ok=True)
        frame_dir = Path(tempfile.mkdtemp(prefix='frames-', dir=work_dir))
        expression = '+'.join(f'eq(n\\,{frame})' for frame in unique_frames)
        run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
             '-threads', '4', '-i', str(movie), '-map', '0:v:0', '-an', '-sn', '-dn',
             '-vf', f'select={expression}', '-fps_mode', 'vfr',
             '-frames:v', str(len(unique_frames)), '-q:v', '2', '-threads', '2',
             '-start_number', '1', str(frame_dir / 'frame-%03d.jpg')])
        extracted = sorted(frame_dir.glob('frame-*.jpg'))
        if len(extracted) != len(unique_frames):
            raise ValueError(f'Expected {len(unique_frames)} selected JPEGs, got {len(extracted)}.')
        frame_paths = dict(zip(unique_frames, extracted))
        for entry in selected:
            entry['extractedImage'] = str(frame_paths[entry['frameNo']].resolve())
        report['selections'] = selected
        report['contactSheets'] = assemble_sheets(selected, frame_paths, export_dir, args.prefix)
        final_stat = movie.stat()
        unchanged = (initial_stat.st_size == final_stat.st_size and
                     initial_stat.st_mtime_ns == final_stat.st_mtime_ns)
        report['checks']['singleDecodeExtraction'] = {
            'passed': True, 'lineSelections': len(selected),
            'uniqueFrameSelections': len(unique_frames), 'jpegFrames': len(extracted),
            'duplicateSelections': len(selected) - len(unique_frames),
            'sameFrameCanServeMultipleLines': True,
            'oneVideoDecodeInvocation': True,
            'selectedFramesAllInsideOwnLine': all(
                entry['lineStartSeconds'] - 1e-8 <= entry['frameTimeSeconds'] <
                entry['lineEndSeconds'] for entry in selected),
        }
        report['checks']['sourceStableDuringExtraction'] = {'passed': unchanged}
        report['passed'] = source_ok and unchanged
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        report['error'] = str(error)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'qa': str(report_path),
                      'lines': len(report['selections']),
                      'contactSheets': len(report['contactSheets']),
                      'error': report.get('error')}, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
