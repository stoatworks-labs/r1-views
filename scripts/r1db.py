"""Shared plumbing for writing R1 remote views into a d&b .dbpr (SQLite).

A View copies the input project, adds one remote view (Views.Type 1000) and
writes Controls rows onto it.  Field values follow R1 3.46.1: controls R1
wrote into a project, and the d&b templates in templates.r2t.  docs/FORMAT.md
has the detail.  Never writes to the input file.
"""
import shutil, sqlite3, sys

FONT = "Arial,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"
DIM = bytes.fromhex("0000000000000000FFFFFFFFFFFFFFFF")

# An amp channel's level (Config_PotiLevel): -57.5 dB to +6 dB in 0.5 dB steps
# (R1 help 6.1.4, Channel control).  The amps refuse anything outside it.
LEVEL_MIN, LEVEL_MAX = -57.5, 6.0


def parse_args(default_name):
    """IN.dbpr OUT.dbpr [--name NAME] -> (src, dst, name)."""
    args = sys.argv[1:]
    name = default_name
    if "--name" in args:
        i = args.index("--name"); name = args[i + 1]; del args[i:i + 2]
    if len(args) != 2:
        sys.exit(f"usage: {sys.argv[0]} IN.dbpr OUT.dbpr [--name {default_name}]")
    return args[0], args[1], name


class View:
    def __init__(self, src, dst, name):
        if src == dst:
            sys.exit("refusing to overwrite the input")
        ro = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
        if ro.execute("select 1 from Views where Name=?", (name,)).fetchone():
            sys.exit(f"a view called {name!r} already exists")
        ro.close()
        shutil.copyfile(src, dst)
        self.db = sqlite3.connect(dst)
        self.db.execute("PRAGMA foreign_keys=OFF")
        self.name = name

        master = self.q("select GroupId from Groups where Name='Master' and Type=0")
        if not master:
            sys.exit("no Master group")
        self.master = master[0][0]
        root = self.q("select GroupId from Groups where ParentId=0 and Type=0 order by GroupId")
        self.root = root[0][0] if root else 0
        self.devname = dict(self.q("select DeviceId, Name from Devices"))
        self.model = dict(self.q("select DeviceId, Model from Devices"))
        self._joined = self.q("select coalesce(max(JoinedId),0) from Controls")[0][0] + 1

        icon = self.q("select Icon from Views where Type=1000 order by length(Icon) limit 1")
        icon = icon[0][0] if icon else None
        hv = self.q("select coalesce(max(HomeViewIndex),0)+1 from Views where Type=1000")[0][0]
        nb = self.q("select coalesce(max(NaviBarIndex),0)+1 from Views")[0][0]
        self.db.execute("insert into Views(Type,Name,Icon,Flags,HomeViewIndex,NaviBarIndex,"
                        "HRes,VRes,ZoomLevel) values(1000,?,?,6,?,?,0,0,100)",
                        (name, icon, hv, nb))
        self.id = self.q("select last_insert_rowid()")[0][0]

    def q(self, s, *a):
        return self.db.execute(s, a).fetchall()

    def join(self):
        """A fresh JoinedId: controls sharing one move as a unit in R1."""
        j = self._joined
        self._joined += 1
        return j

    def ctl(self, t, x, y, w, h, dn, j, *, mn=0.0, mx=0.0, mc=0, sc=0, lc=0, la=64,
            th=0.0, flags=6, act=1, tt=2, ti=0, tc=-1, tp=None, tr=0, align=132):
        """One Controls row.  Defaults are a direct-access control (TargetType 2):
        pass ti=DeviceId, tc=channel; for a group pass tt=0, ti=GroupId, tc=-1."""
        self.db.execute(
            "insert into Controls(Type,PosX,PosY,Width,Height,ViewId,DisplayName,"
            "UniqueName,JoinedId,LimitMin,LimitMax,MainColor,SubColor,LabelColor,"
            "LabelFont,LabelAlignment,LineThickness,ThresholdValue,Flags,ActionType,"
            "TargetType,TargetId,TargetChannel,TargetProperty,TargetRecord,"
            "ConfirmOnMsg,ConfirmOffMsg,PictureIdDay,PictureIdNight,Font,Alignment,"
            "Dimension,LogoId) values(?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,5,?,0,?,?,?,?,?,?,?,?,"
            "NULL,NULL,0,0,?,?,?,0)",
            (t, x, y, w, h, self.id, dn, j, mn, mx, mc, sc, lc, la, th, flags, act, tt, ti,
             tc, tp, tr, FONT, align, DIM))

    def max_delay(self, dev):
        """Longest delay amp dev accepts, in ms.  D6 and D12 stop at 340 ms, which
        is why AutoCreate gives a group holding one a relative delay of +-339.5
        (seen on a D20 and D6 rig) where an all-D40 project gets +-9999.5.
        Inferred from those two files, not read from d&b.  web/src/engine/project.ts
        maxDelay is the twin."""
        return 340.0 if str(self.model.get(dev) or "").strip().upper() in ("D6", "D12") else 10000.0

    def rel_delay(self, gid):
        """The span of a relative delay on group gid: +- the smallest limit among
        every amp channel under it, nested groups included, less 0.5 ms."""
        lim, todo, seen = 10000.0, [gid], set()
        while todo:
            g = todo.pop()
            if g in seen:
                continue
            seen.add(g)
            for t, kid, dev in self.q("select Type, GroupId, TargetId from Groups where ParentId=?", g):
                if t == 1:
                    lim = min(lim, self.max_delay(dev))
                elif t == 0:
                    todo.append(kid)
        return lim - 0.5

    def group(self, name, parent, members=()):
        """Add a group (Groups.Type 0) under parent, holding amp channels given as
        (name, DeviceId, channel): each is a Type 1 row, as R1 writes them.
        Returns the new GroupId.  Keep new groups outside Master: a channel
        listed twice under it would be moved twice by a relative Master."""
        self.db.execute("insert into Groups(Name,ParentId,TargetId,TargetChannel,Type,Flags) "
                        "values(?,?,0,-1,0,0)", (name, parent))
        gid = self.q("select last_insert_rowid()")[0][0]
        for n, dev, ch in members:
            self.db.execute("insert into Groups(Name,ParentId,TargetId,TargetChannel,Type,Flags) "
                            "values(?,?,?,?,1,0)", (n, gid, dev, ch))
        return gid

    def frame(self, x, y, w, h, title, j, mc):
        """A titled frame; mc 14 is R1's Master style, 4 its Group style."""
        self.ctl(12, x, y, w, h, title, j, mc=mc, sc=1, lc=19, flags=70, act=0, tt=-1,
                 tp=None, tr=65535, align=129)

    def taps(self):
        """[(GroupId, name, {"L": [(chan name, DeviceId, ch)], "R": [...]})] for each
        group under Master whose name starts with Tap.  A name ending " L"/" R"
        decides its side; otherwise the first half of a tap's channels on one amp
        are Left and the rest Right."""
        out = []
        for gid, tname in self.q("select GroupId, Name from Groups where ParentId=? and "
                                 "Type=0 and Name like 'Tap%' order by Name", self.master):
            chans = self.q("select Name, TargetId, TargetChannel from Groups where "
                           "ParentId=? and Type=1 order by TargetId, TargetChannel", gid)
            per_dev = {}
            for n, dev, ch in chans:
                per_dev.setdefault(dev, []).append(ch)
            sides = {"L": [], "R": []}
            for n, dev, ch in chans:
                if n.endswith(" L"): s = "L"
                elif n.endswith(" R"): s = "R"
                else:
                    chs = per_dev[dev]
                    s = "L" if chs.index(ch) < (len(chs) + 1) // 2 else "R"
                sides[s].append((n, dev, ch))
            out.append((gid, tname, sides))
        return out

    def finish(self, width, height):
        self.db.execute("update Views set HRes=?, VRes=? where ViewId=?",
                        (width, height, self.id))
        self.db.commit()
        ok = self.q("pragma integrity_check")[0][0]
        self.db.close()
        return ok
