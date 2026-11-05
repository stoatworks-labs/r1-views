#!/usr/bin/env python3
"""Add an R1 remote view to a d&b .dbpr project: one frame per Tap group,
left/right columns, and per amp channel a card with Channel, input and
output (GR/Headroom) meters, Mute, a GR lamp, Delay (on + time), the
frequency generator (mode, frequency, level) and, where the project has
ArrayProcessing slots, one AP lamp per slot.

Usage: python3 -I scripts/tap_view.py IN.dbpr OUT.dbpr [--name Taps]

Taps and sides come from r1db.View.taps().  Control settings are copied from
R1 V3.46.1's own templates.r2t (TOPs / Freq. Generator / meters / LEDs) and
from controls R1 wrote into the project.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -I drops it
from r1db import View, parse_args

# geometry
M = 16            # page margin
PAD = 12          # inside a tap frame
CARD_W = 644
CARD_H = 164      # +AP_ROW when the project has ArrayProcessing slots
AP_ROW = 30
TAP_HEAD = 72     # tap title + tap-wide row
GAP = 12


def main():
    v = View(*parse_args("Taps"))
    ctl, frame = v.ctl, v.frame

    # ArrayProcessing slots each channel can recall, via its cabinet's source
    # group.  A channel can drive several cabinets (one row of an all-D40
    # project had two per channel), and with AP slots on their source group each slot came back
    # once per cabinet, so take each slot once, as the web engine does.
    ap = {}
    for dev, ch, slot, sname in v.q(
            "select distinct c.DeviceId, c.AmplifierChannel, s.Slot, s.Name from Cabinets c "
            "join ArrayProcessingSlots s on s.SourceGroupId = c.SourceGroupId "
            "order by s.Slot"):
        slots = ap.setdefault((dev, ch), [])
        if all(have != slot for have, _ in slots):
            slots.append((slot, sname))
    card_h = CARD_H + (AP_ROW if ap else 0)

    def card(x, y, dev, ch, title, j):
        frame(x, y, CARD_W, card_h, title, j, 4)
        d = dict(ti=dev, tc=ch)
        # Channel: speaker, remote id, ISP/GR/OVL, level, name (opens details)
        ctl(1, x + 13, y + 36, 172, 98, None, j, mc=1, sc=1, lc=1, tp="", tr=65535, **d)
        # meters, the height of the Channel control; field values from the
        # meters in templates.r2t, colours from GuiInfo.db.  In: input peak in
        # dBu.  Out: GR/Headroom, 0 dB = full output, below = headroom, above =
        # gain reduction (R1 help 6.1.4; range from 7.4.4).
        ctl(7, x + 193, y + 36, 16, 98, "In", j, mn=-60.0, mx=25.0001, mc=3, sc=13,
            lc=1, th=19.0, flags=166, tp="ChStatus_InputVoltagePeak", **d)
        ctl(7, x + 219, y + 36, 16, 98, "Out", j, mn=-32.0, mx=32.0001, mc=5, sc=13,
            lc=1, th=0.0, flags=166, tp="ChStatus_GrHead", **d)
        ctl(4, x + 247, y + 36, 52, 52, "Mute", j, mx=1.0, mc=13, sc=13,
            flags=262, tp="Config_Mute", **d)
        # gain reduction lamp (LED fields as templates.r2t's 20x20 LEDs)
        ctl(8, x + 249, y + 100, 20, 20, "GR", j, mc=22, sc=1, la=2, th=1.0,
            tp="ChStatus_Gr", **d)
        # delay: on/off and time
        ctl(4, x + 359, y + 36, 100, 24, "Delay", j, mx=1.0, mc=0, sc=1,
            flags=262, tp="Config_DelayOn", **d)
        # up to the amp's own limit: 340 ms on a D6 or D12, 10 s on the others
        ctl(3, x + 359, y + 66, 100, 24, "Time", j, mn=0.3, mx=v.max_delay(dev), mc=-1, sc=-1,
            lc=1, la=1, tp="ChStatus_MsDelay", align=130, **d)
        # frequency generator: Off / Sine / Pink, frequency, level
        ctl(5, x + 521, y + 36, 110, 24, "Tone", j, mc=8, sc=8, la=1,
            tp="Config_FreqGenMode", **d)
        ctl(3, x + 521, y + 66, 110, 24, "Freq.", j, mn=10.0, mx=20000.0, mc=-1,
            sc=-1, lc=1, la=1, tp="Config_FreqGenFreq", align=130, **d)
        ctl(3, x + 521, y + 96, 110, 24, "Level", j, mn=-57.5, mx=6.0, mc=-1,
            sc=-1, lc=1, la=1, tp="Config_FreqGenLevel", align=130, **d)
        # one lamp per ArrayProcessing slot this channel can recall: AP is
        # switched per slot (TargetRecord = slot), there is no single AP flag
        for k, (slot, sname) in enumerate(ap.get((dev, ch), [])[:10]):
            ctl(8, x + 13 + k * 62, y + CARD_H - 2, 20, 20, f"AP {slot}", j, mc=1,
                sc=1, la=2, th=1.0, tp="ArrayProcessing_Enable", tr=slot, **d)

    y = M
    tap_w = PAD + CARD_W + GAP + CARD_W + PAD
    report = []
    for gid, tname, sides in v.taps():
        rows = max(len(sides["L"]), len(sides["R"]), 1)
        tap_h = TAP_HEAD + rows * card_h + (rows - 1) * GAP + PAD

        joined = v.join()
        frame(M, y, tap_w, tap_h, tname, joined, 14)
        # tap-wide row: the whole group, delay relative (as R1's AutoCreate does),
        # +- the tightest amp limit in the group less 0.5 ms, as AutoCreate sets it
        g = dict(tt=0, ti=gid, tc=-1)
        span = v.rel_delay(gid)
        ctl(4, M + PAD + 13, y + 36, 100, 24, "Mute " + tname, joined, mx=1.0,
            mc=13, sc=13, flags=262, tp="Config_Mute", **g)
        ctl(4, M + PAD + 125, y + 36, 100, 24, "Delay", joined, mx=1.0, mc=0, sc=0,
            flags=262, tp="Config_DelayOn", **g)
        ctl(3, M + PAD + 311, y + 36, 100, 24, "rel. Delay", joined, mn=-span,
            mx=span, mc=-1, sc=-1, la=1, flags=14, tp="ChStatus_MsDelay",
            align=130, **g)
        for col, s in enumerate("LR"):
            cx = M + PAD + col * (CARD_W + GAP)
            for r, (n, dev, ch) in enumerate(sides[s]):
                cy = y + TAP_HEAD + r * (card_h + GAP)
                word = "Left" if s == "L" else "Right"
                card(cx, cy, dev, ch, f"{word} · {n}", v.join())
                report.append(f"{tname:6} {word:5} {n:9} {v.devname.get(dev, dev)} ch{ch}")
        y += tap_h + GAP

    ok = v.finish(M + tap_w + M, y - GAP + M)
    print(f"view {v.id} {v.name!r}: {len(report)} speakers, integrity {ok}")
    print("\n".join(report))


if __name__ == "__main__":
    main()
