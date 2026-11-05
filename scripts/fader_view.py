#!/usr/bin/env python3
"""Add a fader page to a d&b .dbpr project: per Tap, one fader for each
Left/Right pair (the first Left with the first Right, and so on) with an L and
an R meter beside it, a fader of its own for any speaker without a partner,
and a Master fader on the right.  The faders are as tall as the page allows,
for the finest control.

Usage: python3 -I scripts/fader_view.py IN.dbpr OUT.dbpr [--name Faders]
                                        [--size 1680x900] [--no-link]

Linking: R1 cannot tie two fader controls together, so each pair becomes a
group (Groups rows: a folder "<view> links" under the root, outside Master,
one group per pair) and its fader drives the group absolutely: moving it sets
both sides to the same level, like a console's stereo link.  --no-link gives
one fader per channel instead and adds no groups.

Levels: Config_PotiLevel over the amps' own range, -57.5 to +6 dB (0.5 dB
steps).  Master is a relative fader on the Master group over the same span, as
R1's AutoCreate builds its "rel. Level": it moves every channel by the same
amount, keeping their balance, and each stops at the amp's limits.  The meters
are GR/Headroom (output).

--size is the page in R1 pixels; the default fills a 16" MacBook Pro's
1728x1117 desktop once R1's own bars are taken off.  Strips narrower than 80 px
widen the page instead.
"""
import os, sqlite3, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -I drops it
from r1db import View, parse_args, LEVEL_MIN, LEVEL_MAX

M = 16          # page margin
PAD = 12        # inside a frame
GAP = 12        # between frames
SG = 16         # between strips
METER_W = 18
METER_GAP = 6
TITLE = 40      # frame title band
LABEL = 22      # fader name under the fader
MIN_STRIP = 80


def base(n):
    return n[:-2] if n.endswith((" L", " R")) else n


def strips_for(sides, link):
    """[(label, [(name, DeviceId, ch, side), ...])] for one Tap: one entry per
    linked pair, or per channel when not linking or a side has no partner."""
    L = [c + ("L",) for c in sides["L"]]
    R = [c + ("R",) for c in sides["R"]]
    single = lambda c: (c[0] if c[0].endswith((" L", " R")) else f"{c[0]} {c[3]}", [c])
    if not link:
        return [single(c) for c in L + R]
    out = []
    for i in range(max(len(L), len(R))):
        pair = [c for c in (L[i] if i < len(L) else None, R[i] if i < len(R) else None) if c]
        if len(pair) == 1:
            out.append(single(pair[0]))
        else:
            l, r = base(pair[0][0]), base(pair[1][0])
            out.append((f"{l} L/R" if l == r else f"{l} / {r}", pair))
    return out


def main():
    size, link = "1680x900", True
    if "--size" in sys.argv:
        i = sys.argv.index("--size"); size = sys.argv[i + 1]; del sys.argv[i:i + 2]
    if "--no-link" in sys.argv:
        sys.argv.remove("--no-link"); link = False
    W, H = (int(n) for n in size.lower().split("x"))
    src, dst, name = parse_args("Faders")
    folder_name = f"{name} links"
    if link:
        ro = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
        if ro.execute("select 1 from Groups where Name=?", (folder_name,)).fetchone():
            sys.exit(f"a group called {folder_name!r} already exists")
        ro.close()
    v = View(src, dst, name)
    ctl, frame = v.ctl, v.frame

    taps = [(gid, tname, strips_for(sides, link)) for gid, tname, sides in v.taps()]
    pairs = any(len(m) > 1 for _, _, ss in taps for _, m in ss)
    folder = v.group(folder_name, v.root) if pairs else None

    frames = len(taps) + 1                                  # + Master
    strips = sum(len(ss) for _, _, ss in taps) + 1
    strip_w = (W - 2 * M - (frames - 1) * GAP - frames * (2 * PAD - SG)) // strips
    strip_w = max(strip_w, MIN_STRIP)
    fader_w = strip_w - SG - (2 if pairs else 1) * (METER_GAP + METER_W)
    top = M + TITLE
    fader_h = H - M - PAD - LABEL - top
    frame_h = H - 2 * M

    def fader(x, label, j, relative=False, **target):
        # fields as templates.r2t's "rel. Level" fader: absolute (Flags 6) or
        # relative (Flags 14, group targets only)
        ctl(2, x, top, fader_w, fader_h, label, j, mn=LEVEL_MIN, mx=LEVEL_MAX,
            mc=5, sc=1, flags=14 if relative else 6, tp="Config_PotiLevel", **target)

    def meter(x, label, j, dev, ch):
        ctl(7, x, top, METER_W, fader_h, label, j, mn=-32.0, mx=32.0001, mc=5, sc=13,
            lc=1, th=0.0, flags=166, tp="ChStatus_GrHead", ti=dev, tc=ch)

    x = M
    report, used = [], set()
    for gid, tname, ss in taps:
        fw = 2 * PAD + len(ss) * strip_w - SG
        frame(x, M, fw, frame_h, tname, v.join(), 4)
        sx = x + PAD
        for label, members in ss:
            j = v.join()
            if len(members) > 1:
                gname = label if label not in used else f"{tname} {label}"
                used.add(gname)
                pg = v.group(gname, folder, [(n, dev, ch) for n, dev, ch, s in members])
                fader(sx, label, j, tt=0, ti=pg, tc=-1)
                for k, (n, dev, ch, s) in enumerate(members):
                    meter(sx + fader_w + METER_GAP + k * (METER_GAP + METER_W), s, j, dev, ch)
                what = " + ".join(f"{v.devname.get(d, d)} ch{c}" for _, d, c, _ in members)
                report.append(f"{tname:6} {label:13} linked: {what}")
            else:
                n, dev, ch, s = members[0]
                fader(sx, label, j, ti=dev, tc=ch)
                meter(sx + fader_w + METER_GAP, "Out", j, dev, ch)
                report.append(f"{tname:6} {label:13} {v.devname.get(dev, dev)} ch{ch}")
            sx += strip_w
        x += fw + GAP
    fw = 2 * PAD + strip_w - SG
    j = v.join()
    frame(x, M, fw, frame_h, "Master", j, 14)
    fader(x + PAD, "Master", j, relative=True, tt=0, ti=v.master, tc=-1)
    x += fw

    ok = v.finish(max(W, x + M), H)
    print(f"view {v.id} {v.name!r}: {len(report)} faders + Master, faders "
          f"{fader_w}x{fader_h} px ({fader_h / ((LEVEL_MAX - LEVEL_MIN) * 2):.1f} px per "
          f"0.5 dB step), integrity {ok}")
    print("\n".join(report))


if __name__ == "__main__":
    main()
