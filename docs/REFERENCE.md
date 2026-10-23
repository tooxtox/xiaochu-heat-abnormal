# Reference notes for 熱異常 / LAST SIGNAL

Read 2026-10-22. Source repository: [Nyankomintsu/world-execute-me-lyric-mv](https://github.com/Nyankomintsu/world-execute-me-lyric-mv). Downloaded references are in `work/reference/`. The storyboard is at the repository root, not `docs/v4/STORYBOARD.md`.

## Apply the architecture, not the other film's timing or art

The reference is a different song, story, character, and visual palette. Its numerical cue times, BPM, role colours, three-ink character designs, named shot sequence, and preroll duration are not facts about 熱異常. The latest user instruction takes priority: generate Xiaochu with the image model, then trace and recolour her locally. Keep her mint hair/ears, pink eyes, tail, and mint/white clothing visible in the final assets.

## Deterministic rendering and export

From [KIT.md](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/docs/v4/KIT.md): each shot is declarative metadata plus a pure time renderer. Recreating a frame must not depend on previous frames, wall-clock time, or unseeded randomness. Draw an afterimage by evaluating the same object at an earlier time. Keep modules importable without the DOM so a script can inspect shot coverage and generate a storyboard. Create canvases lazily during rendering. Text is loaded from data and addressed by index, not duplicated in scene code. Inspect the first frame after each cut, the main event, the final frame, and transitions. Render character closeups at final resolution to check the actual contour quality.

From [export/export.mjs](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/export/export.mjs): a headless Chrome renderer streams raw RGBA frames into FFmpeg with backpressure, avoiding tens of thousands of PNGs. The browser explicitly acknowledges readiness. Integer frame indices define sample times. Song time stays independent of preroll; negative video time delays the audio by an exact sample count. The exporter probes NVENC at the real output size before selecting it. It can export arbitrary short ranges and contact sheets through the real rendering pipeline. A simpler PNG/pipe implementation is fine if it retains these properties.

For the requested local trace/recolour pipeline, [trace.js](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/src/engine/trace.js) builds smooth contour paths from coverage masks with marching squares, removes tiny regions, and simplifies contours. [art.js](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/src/engine/art.js) separates generated art once at load, builds masks and vector contours once, then recolours via palette roles. No pixel classification runs during frame rendering. Its cumulative masks overlap under upper colours to prevent hairline seams. This is useful for Xiaochu after reducing the generated drawing to deliberate mint/white/pink/shadow/outline regions; the other project's colour classifier itself is tailored to its three source inks and should not be copied blindly.

## Timing and story

From [PLAN.md](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/docs/v4/PLAN.md): colours are narrative states triggered by events. Every shot has a specific story moment, readable subject, and foreground or interface layer. Effects should have a cause. Store beat-grid helpers separately from measured voice/drum cues. Keep every nongrid time in one cue table with its source and confidence. Preserve song time when adding pre/postroll. Cuts can use the beat grid while the event inside the shot follows the actual voice. For this film, derive the grid and all timings from the chosen Bilibili 25時 2DMV audio.

From [STORYBOARD.md](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/STORYBOARD.md): useful per-shot fields are start/end, musical location, id, lyric range, story event, composition, palette state, transition, and camera. This makes coverage and accidental placeholders inspectable. Use song-specific shot lengths; do not split the runtime into eleven equal scenes.

## Motion and QA lessons

From [PROMPT_v4.md](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/docs/v4/PROMPT_v4.md): validate the most important still/composition early, then render short sections before the full export. Check recognisability without relying on captions. Shared rendering changes need before/after comparisons of unaffected frames. Keep a progress record of completed scenes, deviations, cue confidence, and remaining work. Prefer a simple effect that reads clearly over an effect that repeatedly fails.

The later [PROMPT_v4_fix.md](https://github.com/Nyankomintsu/world-execute-me-lyric-mv/blob/main/docs/v4/PROMPT_v4_fix.md) overrides earlier instructions for that project. Its practical lesson: sustained 8/12 FPS stepping read as poor playback, so the revision restores continuous 60 FPS movement and makes glitches discrete events. Layer a stable character with moving foreground, glyphs inside masks, background geometry, small eased offsets, and restrained camera motion. Voice onsets carry primary text events; drums can trigger preparation and aftermath. Render only changed shots, compare untouched sections numerically, rerender failed ranges, and encode the full preview once after checks pass.

## QA measures worth adapting

- Structural: no gaps/overlaps, real song duration, lyric coverage, no fallback shots, no missing story metadata.
- Determinism: render selected times twice and compare pixels; render them in reverse order as well.
- Visual: final-resolution contact sheets, first/event/last frames, smallest-readable lyrics, clean character silhouette and traced contours.
- Media: probe width/height/FPS/codec/audio duration; compare first and last beat/voice events for offset/drift; decode the final file.
- Flash: measure actual exported frames; a scalar effect cap does not constrain combinations of bloom, inversion, motion, and cuts. The reference uses a maximum of three large bright/dark cycles per second, holds tear patterns for at least six frames at 60 FPS, and reports the worst second. Treat its checker as a heuristic, not a certification.
- Reference tools available locally for study: `check_flash.py`, `luma.py`, `measure_cues.py`, `trace.js`, `art.js`, `prng.js`, and `export.mjs`. They have their own dependencies; do not assume they are immediately runnable in this workspace.
