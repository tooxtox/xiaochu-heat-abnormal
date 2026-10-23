"""Stream actual encoded frames for a coarse luminance/red flash heuristic."""
import argparse
from collections import deque
from fractions import Fraction
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 160, 90
AREA = .25


def measures(rgb):
    rgb = rgb.astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = .2126*r + .7152*g + .0722*b
    saturated = (r >= 100) & (r >= 1.5*g) & (r >= 1.5*b) & ((r-np.maximum(g,b)) >= 65)
    return luma, np.where(saturated, r-(g+b)/2, 0)


def transition(before, after):
    result = {}
    for index, (name, threshold) in enumerate([('luminance',51), ('saturated_red',65)]):
        delta = after[index]-before[index]
        active = np.maximum(before[index],after[index]) > (80 if index == 0 else 0)
        up = float(np.mean((delta > threshold) & active))
        down = float(np.mean((delta < -threshold) & active))
        if max(up,down) > AREA:
            direction = 0 if min(up,down) > AREA else (1 if up > down else -1)
            result[name] = {'up_area':round(up,4), 'down_area':round(down,4), 'direction':direction}
    return result


def scan_windows(events):
    worst, flagged = {}, []
    for family in ('luminance','saturated_red'):
        window, best = deque(), {'opposing_transitions':0, 'raw_transitions':0, 'start':None, 'end':None}
        for event in events:
            if family not in event:
                continue
            now = event['time']
            window.append((now,event[family]['direction']))
            while window and window[0][0] < now-1-1e-7:
                window.popleft()
            opposing, previous = 0, None
            for _, direction in window:
                # Mixed-direction frames conservatively count as a change in either direction.
                if previous is None or direction == 0 or previous == 0 or direction != previous:
                    opposing += 1
                previous = direction
            candidate = {'opposing_transitions':opposing, 'raw_transitions':len(window),
                         'start':round(max(0,now-1),6), 'end':now}
            if (opposing,len(window)) > (best['opposing_transitions'],best['raw_transitions']):
                best = candidate
            if opposing >= 6:
                if flagged and flagged[-1]['family'] == family and candidate['start'] <= flagged[-1]['end']:
                    flagged[-1]['end'] = now
                    flagged[-1]['max_opposing_transitions'] = max(opposing,flagged[-1]['max_opposing_transitions'])
                else:
                    flagged.append({'family':family,'start':candidate['start'],'end':now,
                                    'max_opposing_transitions':opposing})
        worst[family] = best
    return worst, flagged


def self_test():
    black = np.zeros((9,16,3),np.uint8)
    white = np.full_like(black,255)
    red = black.copy(); red[...,0] = 255
    assert not transition(measures(black),measures(black))
    for bright, family in [(white,'luminance'),(red,'saturated_red')]:
        events = []
        before = measures(black)
        for frame in range(1,8):
            after = measures(bright if frame % 2 else black)
            events.append(dict(frame=frame,time=round(frame*.1,6),**transition(before,after)))
            before = after
        worst, flagged = scan_windows(events)
        assert worst[family]['opposing_transitions'] == 7, worst
        assert any(item['family'] == family for item in flagged), flagged
    small = black.copy(); small[:2,:2] = 255
    assert not transition(measures(black),measures(small))
    print('Flash self-test passed: static frames, full-area alternating luminance/red, small-area rejection.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('movie', nargs='?', type=Path, default=ROOT/'export/LAST-SIGNAL-1080p60-rough-cut.mp4')
    parser.add_argument('--output', type=Path, default=ROOT/'export/flash-check.json')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.movie.is_file():
        parser.error('Encoded movie must exist.')
    metadata = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
        '-show_entries','stream=avg_frame_rate,nb_frames,width,height,duration','-of','json',str(args.movie)]))
    stream = metadata['streams'][0]
    fps = float(Fraction(stream['avg_frame_rate']))
    if fps <= 0:
        raise ValueError('A positive constant frame rate is required.')
    error_log = tempfile.TemporaryFile()
    process = subprocess.Popen(['ffmpeg','-v','error','-i',str(args.movie),'-map','0:v:0',
        '-an','-sn','-dn','-vf',f'scale={WIDTH}:{HEIGHT}:flags=area','-fps_mode','passthrough',
        '-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=error_log)
    events, previous, count = [], None, 0
    try:
        while True:
            buffer = process.stdout.read(WIDTH*HEIGHT*3)
            if not buffer:
                break
            if len(buffer) != WIDTH*HEIGHT*3:
                raise ValueError('Truncated raw frame from ffmpeg.')
            current = measures(np.frombuffer(buffer,np.uint8).reshape(HEIGHT,WIDTH,3))
            if previous is not None:
                change = transition(previous,current)
                if change:
                    events.append(dict(frame=count,time=round(count/fps,6),**change))
            previous = current
            count += 1
        exit_code = process.wait()
        error_log.seek(0)
        errors = error_log.read().decode('utf8',errors='replace')
        if exit_code != 0:
            raise RuntimeError(f'ffmpeg decode failed: {errors[-2000:]}')
    finally:
        process.stdout.close(); error_log.close()
        if process.poll() is None:
            process.kill(); process.wait()
    expected = int(stream['nb_frames']) if str(stream.get('nb_frames','')).isdigit() else None
    decode_passed = count > 0 and (expected is None or count == expected)
    worst, flagged = scan_windows(events)
    report = {
        'schema_version':1, 'movie':str(args.movie.resolve()),
        'method':'Every decoded frame, area-downsampled to 160×90 RGB; adjacent-frame luminance and saturated-red changes.',
        'thresholds':{'area_fraction_greater_than':AREA,'luminance_change_8bit':51,
                      'red_change_8bit':65,'opposing_transitions_in_1_second':6},
        'fps':fps,'decoded_frames':count,'expected_frames':expected,'decode_passed':decode_passed,
        'screening_passed':decode_passed and not flagged,'worst_windows':worst,
        'flagged_windows':flagged,'large_area_transition_frames':len(events),'transitions':events,
        'certification':False,
        'limitations':'Coarse heuristic, not photosensitive-epilepsy safety certification. Assumes constant frame rate; downsampling can miss small/local patterns. Same-direction repeats are collapsed; mixed-direction frames are conservatively treated as opposing changes.',
    }
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:report[k] for k in ('decoded_frames','expected_frames','decode_passed','screening_passed','worst_windows','flagged_windows')},ensure_ascii=False))
    raise SystemExit(0 if report['screening_passed'] else 1)


if __name__ == '__main__':
    main()
