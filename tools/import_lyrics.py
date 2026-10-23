"""Import a user-supplied standard/enhanced LRC; never fetch song lyrics."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAMP = r"(\d{1,3}):([0-5]?\d(?:\.\d{1,3})?)"
LINE_TIME = re.compile(r"\[" + STAMP + r"\]")
WORD_TIME = re.compile(r"<" + STAMP + r">")


def seconds(match):
    return int(match.group(1)) * 60 + float(match.group(2))


def parse_lrc(source, duration=None):
    offset_tag = re.search(r"\[offset:([+-]?\d+)\]", source, re.I)
    offset = int(offset_tag.group(1)) / 1000 if offset_tag else 0
    lines = []
    boundaries = set()
    for raw in source.splitlines():
        stamps = list(LINE_TIME.finditer(raw))
        if not stamps:
            continue
        boundaries.update(max(0, seconds(stamp) + offset) for stamp in stamps)
        text = LINE_TIME.sub("", raw).strip()
        if not text:
            continue
        inline = list(WORD_TIME.finditer(text))
        for stamp in stamps:
            time = max(0, seconds(stamp) + offset)
            words = []
            if inline:
                prefix = text[:inline[0].start()]
                if prefix.strip():
                    words.append({"time": time, "text": prefix, "timing": "estimated"})
                for index, marker in enumerate(inline):
                    next_marker = inline[index + 1] if index + 1 < len(inline) else None
                    word = text[marker.end():next_marker.start() if next_marker else len(text)]
                    if word:
                        words.append({"time": max(0, seconds(marker) + offset), "text": word, "timing": "explicit"})
                plain = WORD_TIME.sub("", text)
            else:
                plain = text
            lines.append({"time": round(time, 4), "text": plain, "words": words,
                          "timing": "explicit", "wordTiming": "explicit-starts" if inline else "estimated"})
    lines.sort(key=lambda line: line["time"])
    for index, line in enumerate(lines):
        later_times = sorted(time for time in boundaries if time > line["time"])
        end = later_times[0] if later_times else (duration if duration is not None else line["time"] + 4)
        end = max(line["time"], end)
        line["end"] = round(end, 4)
        line["endTiming"] = "next-timestamp" if later_times else "estimated"
        if not line["words"]:
            tokens = re.findall(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[^\s]", line["text"])
            for token_index, token in enumerate(tokens):
                start = line["time"] + (end - line["time"]) * token_index / len(tokens)
                stop = line["time"] + (end - line["time"]) * (token_index + 1) / len(tokens)
                line["words"].append({"time": round(start, 4), "end": round(stop, 4), "text": token,
                                      "timing": "estimated", "endTiming": "estimated"})
        else:
            for word_index, word in enumerate(line["words"]):
                following = line["words"][word_index + 1] if word_index + 1 < len(line["words"]) else None
                word["time"] = round(min(end, max(line["time"], word["time"])), 4)
                word["end"] = round(min(end, max(word["time"], following["time"] if following else end)), 4)
                word["endTiming"] = following["timing"] if following else "estimated"
    return {"schemaVersion": 1, "sourceType": "user-supplied-lrc", "offsetSeconds": offset,
            "timingNote": "Line and enhanced word start tags are explicit; interpolated words and final ends are estimated. Listen and adjust before final export.",
            "lines": lines}


def self_test():
    result = parse_lrc("[offset:100]\n[00:01.00]甲乙\n[00:03.00]<00:03.00>甲<00:03.50>乙\n[00:05.00][00:07.00]repeat", 9)
    assert len(result["lines"]) == 4
    assert result["lines"][0]["time"] == 1.1
    assert result["lines"][0]["words"][1]["time"] == 2.1
    assert result["lines"][1]["words"][0]["end"] == 3.6
    assert result["lines"][1]["words"][0]["timing"] == "explicit"
    assert result["lines"][-1]["end"] == 9
    assert parse_lrc("[00:01.00]甲\n[00:02.00]\n[00:03.00]乙")["lines"][0]["end"] == 2
    print("LRC self-test passed: offsets, duplicate tags, explicit and estimated word timing.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=ROOT / "data/lyrics.json")
    parser.add_argument("--duration", type=float, help="Exact local-audio duration, in seconds")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.input or not args.input.is_file():
        parser.error("Supply a local .lrc file.")
    result = parse_lrc(args.input.read_text(encoding="utf-8-sig"), args.duration)
    if not result["lines"]:
        parser.error("No [mm:ss.xx] lyric timestamps were found.")
    result["source"] = args.input.name
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Imported {len(result['lines'])} lines to {args.output}; interpolated word timing is marked estimated.")


if __name__ == "__main__":
    main()
