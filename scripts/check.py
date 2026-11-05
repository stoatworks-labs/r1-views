#!/usr/bin/env python3
"""Check a generated .dbpr against the project it came from and R1's own catalogue.

Usage: python3 -I scripts/check.py NEW.dbpr ORIGINAL.dbpr [GuiInfo.db]

Fails (exit 1) if anything outside the new view(s) changed (new Groups rows
are allowed, for linked faders, but must hang off existing groups, list real
channels and stay out of Master; new Pictures rows only if a new Picture
control uses them), a control is bound to a channel or group
that does not exist, a property/control-type pair is not
in R1's ControlsAndFunctions, a control leaves the canvas, two non-frame
controls overlap (a Picture is a background and may sit under them), or a
control sits outside every frame.  Passing this is not
the same as R1 accepting the file: open it in R1 before trusting it.
"""
import sqlite3, sys

GUI = "/Applications/R1 V3.app/Contents/MacOS/GuiInfo.db"

def main():
    new, old = sys.argv[1:3]
    gui = sys.argv[3] if len(sys.argv) > 3 else GUI
    db = sqlite3.connect(f"file:{new}?mode=ro", uri=True)
    db.execute("attach ? as o", (f"file:{old}?mode=ro",))
    db.execute("attach ? as g", (f"file:{gui}?mode=ro",))
    q = lambda s, *a: db.execute(s, a).fetchall()
    bad = []

    views = q("select ViewId, Name, HRes, VRes from Views "
              "where ViewId not in (select ViewId from o.Views)")
    if not views:
        sys.exit("no new view found")
    ids = ",".join(str(v[0]) for v in views)
    # pictures the new views show (a floorplan's background)
    pics = ",".join(str(p[0]) for p in q(
        f"select PictureIdDay from Controls where ViewId in ({ids}) and PictureIdDay<>0 union "
        f"select PictureIdNight from Controls where ViewId in ({ids}) and PictureIdNight<>0")) or "-1"

    # 1. only Views and Controls may differ, and only by rows on the new views
    for (t,) in q("select name from sqlite_master where type='table' and name<>'sqlite_sequence'"):
        gone = q(f"select count(*) from (select * from o.{t} except select * from main.{t})")[0][0]
        if t == "Views":
            extra = q(f"select count(*) from (select * from main.Views except select * from o.Views) "
                      f"where ViewId not in ({ids})")[0][0]
        elif t == "Controls":
            extra = q(f"select count(*) from (select * from main.Controls except select * from o.Controls) "
                      f"where ViewId not in ({ids})")[0][0]
        elif t == "Pictures":
            extra = q(f"select count(*) from (select * from main.Pictures except select * from o.Pictures) "
                      f"where PictureId not in ({pics})")[0][0]
        elif t == "Groups":       # new groups (linked faders) may be added, old ones not touched
            extra = q("select count(*) from (select * from main.Groups except select * from o.Groups) "
                      "where GroupId in (select GroupId from o.Groups)")[0][0]
        else:
            extra = q(f"select count(*) from (select * from main.{t} except select * from o.{t})")[0][0]
        if extra or gone:
            bad.append(f"{t}: {extra} rows added or changed, {gone} removed outside the new view")

    # 2. added groups hang off real groups, list real channels, and stay out of
    # Master (a channel twice under Master would be moved twice by a relative Master)
    parent = dict(q("select GroupId, ParentId from Groups"))
    master = {g for (g,) in q("select GroupId from Groups where Name='Master' and Type=0")}
    added = q("select GroupId, Name, ParentId, Type, TargetId, TargetChannel from Groups "
              "where GroupId not in (select GroupId from o.Groups)")
    for gid, gname, par, gt, ti, tc in added:
        if par not in parent:
            bad.append(f"group {gid} {gname!r}: parent {par} does not exist")
        if gt == 1 and not q("select 1 from AmplifierChannels where DeviceId=? and AmplifierChannel=?", ti, tc):
            bad.append(f"group {gid} {gname!r}: no amp channel {ti}/{tc}")
        if gt == 1 and q("select Type from Groups where GroupId=?", par) != [(0,)]:
            bad.append(f"group {gid} {gname!r}: a channel must sit in a group, not in a channel")
        a, seen = par, set()
        while a and a not in seen:
            if a in master:
                bad.append(f"group {gid} {gname!r}: added under Master")
                break
            seen.add(a); a = parent.get(a)
    if added:
        print(f"{len(added)} groups added: "
              f"{sum(1 for r in added if r[3] == 0)} groups, {sum(1 for r in added if r[3] == 1)} channel entries")

    for vid, name, W, H in views:
        rows = q("select ControlId, Type, PosX, PosY, Width, Height, TargetType, TargetId, "
                 "TargetChannel, TargetProperty, TargetRecord from Controls where ViewId=?", vid)
        print(f"view {vid} {name!r}: {len(rows)} controls, canvas {W}x{H}")
        for cid, pd, pn in q("select ControlId, PictureIdDay, PictureIdNight from Controls "
                             "where ViewId=? and Type=14", vid):
            if not q("select 1 from Pictures where PictureId=?", pd) or not q("select 1 from Pictures where PictureId=?", pn):
                bad.append(f"control {cid}: its picture is missing")
        for cid, t, x, y, w, h, tt, ti, tc, tp, tr in rows:
            rows_ap = tp and tp.startswith("ArrayProcessing_")
            if rows_ap and not q("select 1 from Cabinets c join ArrayProcessingSlots s on "
                                 "s.SourceGroupId=c.SourceGroupId where c.DeviceId=? and "
                                 "c.AmplifierChannel=? and s.Slot=?", ti, tc, tr):
                bad.append(f"control {cid}: channel {ti}/{tc} has no AP slot {tr}")
            if tt == 2 and not q("select 1 from AmplifierChannels where DeviceId=? and AmplifierChannel=?", ti, tc):
                bad.append(f"control {cid}: no amp channel {ti}/{tc}")
            if tt == 0 and not q("select 1 from Groups where GroupId=?", ti):
                bad.append(f"control {cid}: no group {ti}")
            if tp and not q("select 1 from g.ControlsAndFunctions where ObjectName=? and ControlTypeId=?", tp, t):
                bad.append(f"control {cid}: R1 has no type-{t} control for {tp}")
            if x < 0 or y < 0 or x + w > W or y + h > H:
                bad.append(f"control {cid}: outside the {W}x{H} canvas")
        ctl = [r for r in rows if r[1] != 12]
        solid = [r for r in ctl if r[1] != 14]      # a Picture is a background
        frames = [r for r in rows if r[1] == 12]
        for i, a in enumerate(solid):
            for b in solid[i + 1:]:
                if a[2] < b[2] + b[4] and b[2] < a[2] + a[4] and a[3] < b[3] + b[5] and b[3] < a[3] + a[5]:
                    bad.append(f"controls {a[0]} and {b[0]} overlap")
        for a in ctl:
            if not any(f[2] <= a[2] and f[3] <= a[3] and a[2] + a[4] <= f[2] + f[4]
                       and a[3] + a[5] <= f[3] + f[5] for f in frames):
                bad.append(f"control {a[0]}: not inside any frame")
        for p, n in q("select coalesce(nullif(TargetProperty,''),'(Channel)'), count(*) from Controls "
                      "where ViewId=? and TargetType=2 group by 1", vid):
            print(f"  {p:22} {n}")

    if q("pragma integrity_check")[0][0] != "ok":
        bad.append("sqlite integrity_check failed")
    for b in bad:
        print("FAIL", b)
    print("ok" if not bad else f"{len(bad)} problem(s)")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
