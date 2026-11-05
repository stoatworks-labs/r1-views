#!/usr/bin/env python3
"""Draw a rough PNG of an R1 remote view from a .dbpr, so a layout can be eyeballed
without R1.  It is a sketch of positions and bindings, not R1's rendering: meters
show a sample level and lamps are drawn lit so they can be seen.

Usage: python3 -I scripts/preview.py PROJECT.dbpr OUT.png [--view Taps]
"""
import sqlite3, sys
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
view = "Taps"
if "--view" in args:
    i = args.index("--view"); view = args[i + 1]; del args[i:i + 2]
db = sqlite3.connect(f"file:{args[0]}?mode=ro", uri=True)
vid, W, H = db.execute("select ViewId,HRes,VRes from Views where Name=?", (view,)).fetchone()
ch = {(d, c): n for d, c, n in db.execute("select DeviceId,AmplifierChannel,Name from AmplifierChannels")}
dev = dict(db.execute("select DeviceId, Model||' '||RemoteIdSubnet||'.'||RemoteIdDevice from Devices"))
img = Image.new("RGB", (W, H), (38, 40, 44)); d = ImageDraw.Draw(img)
f = lambda s: ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", s)
F, FB = f(12), f(14)
LABEL = (200, 200, 200)
SAMPLE = {"ChStatus_InputVoltagePeak": -6.0, "ChStatus_GrHead": -12.0}   # sample levels drawn
LAMP = {"ChStatus_Gr": (230, 190, 40), "ArrayProcessing_Enable": (60, 150, 230)}

rows = db.execute(
    "select Type,PosX,PosY,Width,Height,DisplayName,MainColor,LabelAlignment,TargetProperty,"
    "TargetId,TargetChannel,LimitMin,LimitMax,ThresholdValue from Controls where ViewId=? "
    "order by ControlId", (vid,))
for t, x, y, w, h, dn, mc, la, tp, ti, tc, lo, hi, th in rows:
    r = (x, y, x + w, y + h)
    if t == 12:                                   # frame
        d.rounded_rectangle(r, 6, fill=(52, 55, 61) if mc == 14 else (64, 68, 75), outline=(110, 115, 125))
        d.text((x + 10, y + 7), dn, font=FB, fill=(235, 235, 235)); continue
    if t == 1:                                    # Channel control
        d.rectangle(r, fill=(28, 30, 33), outline=(90, 95, 104))
        d.text((x + 6, y + 6), f"{dev[ti]} ch{tc}   ISP GR OVL", font=F, fill=(160, 165, 172))
        d.rectangle((x + 6, y + 36, x + 100, y + 58), outline=(90, 95, 104))
        d.text((x + 10, y + 40), "level 0.0 dB", font=F, fill=LABEL)
        d.text((x + 6, y + 74), ch[(ti, tc)], font=F, fill=(235, 235, 235)); continue
    if t == 7:                                    # meter: well, threshold tick, sample bar
        at = lambda v: y + h - (v - lo) / (hi - lo) * h
        d.rectangle(r, fill=(20, 21, 23), outline=(90, 95, 104))
        d.rectangle((x + 3, at(SAMPLE.get(tp, lo)), x + w - 3, y + h - 2), fill=(60, 170, 80))
        d.line((x, at(th), x + w, at(th)), fill=(200, 60, 60), width=2)
        if dn: d.text((x + w / 2, y + h + 2), dn, font=F, fill=LABEL, anchor="mt")
        continue
    if t == 2:                                    # fader: track, dB ticks, cap at 0 dB
        at = lambda v: y + 10 + (hi - v) / (hi - lo) * (h - 20)
        d.rectangle(r, fill=(30, 32, 36), outline=(90, 95, 104))
        cx = x + w / 2
        d.rectangle((cx - 3, y + 10, cx + 3, y + h - 10), fill=(12, 12, 14))
        for v in (6, 0, -6, -12, -20, -30, -40, -50, -57.5):
            if lo <= v <= hi:
                d.line((x + 6, at(v), cx - 8, at(v)), fill=(120, 125, 135))
                d.text((x + w - 4, at(v)), f"{v:g}", font=F, fill=(150, 155, 162), anchor="rm")
        d.rounded_rectangle((x + 8, at(0) - 9, x + w - 8, at(0) + 9), 3, fill=(170, 175, 185))
        if dn: d.text((cx, y + h + 4), dn, font=F, fill=(235, 235, 235), anchor="mt")
        continue
    if t == 8:                                    # lamp, drawn lit, label to the right
        d.ellipse(r, fill=LAMP.get(tp, (120, 200, 120)), outline=(20, 20, 20))
        if dn: d.text((x + w + 6, y + h / 2), dn, font=F, fill=LABEL, anchor="lm")
        continue
    col = {"Config_Mute": (190, 50, 50), "Config_DelayOn": (70, 120, 190),
           "Config_FreqGenMode": (150, 110, 40)}.get(tp, (28, 30, 33))
    d.rounded_rectangle(r, 4, fill=col, outline=(120, 125, 135))
    inner = {"ChStatus_MsDelay": "0.3 ms", "Config_FreqGenFreq": "1000 Hz",
             "Config_FreqGenLevel": "-20.0 dBu", "Config_FreqGenMode": "Off"}.get(tp, dn)
    if t == 3 and tp == "ChStatus_MsDelay" and "rel" in dn: inner = "±0.0 ms"
    d.text((x + w / 2, y + h / 2), inner, font=F, fill=(240, 240, 240), anchor="mm")
    if la == 1 and t in (3, 5): d.text((x - 6, y + h / 2), dn, font=F, fill=LABEL, anchor="rm")
img.save(args[1]); print(args[1], img.size)
