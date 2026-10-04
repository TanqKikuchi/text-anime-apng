"""Compare an exported APNG against per-frame preview renders (D-04 thresholds).

Usage: python tools/compare_frames.py <file.apng> <expected_dir> --fps N --mode full|palette

expected_dir holds frame_0000.png … (preview render at each source frame time, untrimmed,
same size as the APNG). Merged APNG frames are expanded back to source frames using their
delay. Exit 0 = pass, 1 = fail, 2 = structural mismatch.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def expand(path: Path, fps: int) -> list[np.ndarray]:
    im = Image.open(path)
    out: list[np.ndarray] = []
    # Pillow lists a default image that is not part of the animation (EXP-13) as frame 0: skip it.
    first = 1 if im.info.get("default_image") else 0
    for idx in range(first, getattr(im, "n_frames", 1)):
        im.seek(idx)
        rgba = np.asarray(im.convert("RGBA"), dtype=np.int16)
        repeat = max(1, round(float(im.info.get("duration", 1000 / fps)) * fps / 1000))
        out.extend([rgba] * repeat)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("apng")
    ap.add_argument("expected_dir")
    ap.add_argument("--fps", type=int, required=True)
    ap.add_argument("--mode", choices=["full", "palette"], required=True)
    args = ap.parse_args()

    expected = sorted(Path(args.expected_dir).glob("frame_*.png"))
    actual = expand(Path(args.apng), args.fps)
    if len(actual) != len(expected):
        print(json.dumps({"ok": False, "error": f"frame count {len(actual)} != expected {len(expected)}"}))
        return 2
    worst = {"rgb_mean": 0.0, "rgb_p99": 0.0, "alpha_max": 0}
    failures = []
    for i, (exp_path, act) in enumerate(zip(expected, actual)):
        exp = np.asarray(Image.open(exp_path).convert("RGBA"), dtype=np.int16)
        if exp.shape != act.shape:
            print(json.dumps({"ok": False, "error": f"frame {i} size {act.shape} != {exp.shape}"}))
            return 2
        alpha = np.abs(exp[..., 3] - act[..., 3])
        alpha_diff = int(alpha.max())
        visible = (exp[..., 3] > 0) | (act[..., 3] > 0)
        if visible.any():
            # Premultiplied colour difference: what is actually visible after compositing (D-04).
            pe = exp[..., :3] * exp[..., 3:4] / 255.0
            pa = act[..., :3] * act[..., 3:4] / 255.0
            d = np.abs(pe - pa)[visible]
            rgb_mean, rgb_p99 = float(d.mean()), float(np.percentile(d, 99))
            alpha_p99 = float(np.percentile(alpha[visible], 99))
        else:
            rgb_mean = rgb_p99 = alpha_p99 = 0.0
        worst["rgb_mean"] = max(worst["rgb_mean"], rgb_mean)
        worst["rgb_p99"] = max(worst["rgb_p99"], rgb_p99)
        worst["alpha_max"] = max(worst["alpha_max"], alpha_diff)
        worst["alpha_p99"] = max(worst.get("alpha_p99", 0.0), alpha_p99)
        if args.mode == "full":
            bad = alpha_diff != 0 or rgb_mean != 0 or rgb_p99 != 0
        else:
            bad = rgb_mean > 4.5 or rgb_p99 > 18 or alpha_p99 > 12 or alpha_diff > 32
        if bad:
            failures.append(i)
    result = {"ok": not failures, "frames": len(expected), "worst": worst, "failed_frames": failures[:20]}
    print(json.dumps(result))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
