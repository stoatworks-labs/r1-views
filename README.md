# r1-views

These scripts write remote views (R1's control pages) straight into a d&b R1 project file (`.dbpr`), so nobody
has to drag 178 controls into place by hand on a Tuesday afternoon.

**In a browser:** the [R1 Layout Builder](https://r1-layout.stoatworks-labs.com) (preview) does the
same from a web page, with more page types, a strip designer and floorplans. It's `web/` here.
Nothing is uploaded. Not made, checked or endorsed by d&b audiotechnik.

A `.dbpr` is a plain SQLite database. Every widget on a remote view is a row in its `Controls`
table. R1's own templates ship inside the app as another SQLite file, so the right values for each
control can be copied rather than guessed. [docs/FORMAT.md](docs/FORMAT.md) has the details.

> **Status:** R1 3.46.1 has opened one (a real D20 and D6 rig, both views, 5 November 2026) and saved it back
> with every control and group intact, drawing its own thumbnails of both pages on the way. Nobody
> has yet pressed anything on those pages with amps attached, so treat the controls as untested
> until somebody has. What R1 rewrites when it saves is in [docs/FORMAT.md](docs/FORMAT.md#what-r1-does-when-it-saves).
>
> **R1 has not yet opened a file made by the web tool** (`web/`). Open its output in R1
> (Configuration mode, offline) and look at every new view before it goes anywhere near a show.

## What's here

| Script | What it does |
| --- | --- |
| `scripts/tap_view.py` | Adds a **Taps** view: one frame per `Tap …` group under `Master`, with Left and Right columns. Each Tap gets a row of mute, delay and relative-delay controls for the whole Tap. Each speaker gets a card with Channel, input and output meters, Mute, a GR lamp, Delay on/off and time, and the frequency generator (Off/Sine/Pink, frequency, level). If the project has ArrayProcessing slots, each card also gets one AP lamp per slot. |
| `scripts/fader_view.py` | Adds a **Faders** view, with a frame per Tap and a Master fader. Each Left/Right pair gets one linked fader with an L and an R output meter. A speaker without a partner, or every speaker with `--no-link`, gets a fader and meter of its own. The faders are as tall as the page allows (`--size`, default 1680×900): 794 px for the amps' 63.5 dB, about 6 px per 0.5 dB step. |
| `scripts/check.py` | Compares the result with the original and with R1's catalogue. It fails if anything outside the new view changed, a control points at a channel or group that doesn't exist, R1 has no such property for that control type, or controls overlap or stray outside their frames. New groups are allowed (for linked faders) but never inside `Master`. New `Pictures` rows are allowed only when a new Picture control uses them, and a picture is a background, so it may sit under other controls. |
| `scripts/preview.py` | Draws a rough PNG of a view (`--view`), so you can check the layout without R1. It's a sketch, not R1's own rendering: meters show a sample level and lamps are drawn lit. |
| `scripts/r1db.py` | The shared plumbing: copying the project, adding a view, writing control rows, and working out Taps and sides. |

## Use

```bash
python3 -I scripts/tap_view.py show.dbpr step1.dbpr
python3 -I scripts/fader_view.py step1.dbpr show-views.dbpr
python3 -I scripts/check.py show-views.dbpr show.dbpr
python3 -I scripts/preview.py show-views.dbpr taps.png --view Taps
```

Each page script adds one view, so chain them to add both. Neither writes to its input. Each
refuses to run if the output path is the input, or if the project already has a view with that
name. `--name` changes the view name.

`check.py` reads R1's `GuiInfo.db` from `/Applications/R1 V3.app`. Pass another path as the third
argument for a different install. `preview.py` needs Pillow.

## Left and right

A channel whose name ends in ` L` or ` R` goes to that side. Otherwise, the first half of a Tap's
channels on one amp go Left and the rest go Right. So a D20 with tops and subs on 1–4 comes out as
1 and 2 on the left and 3 and 4 on the right. If a rig is wired some other way, rename the channels
in R1 so they end in L or R, and run the script again.

## Levels

Channel faders cover the amps' own level range, −57.5 to +6 dB in 0.5 dB steps, because that's
what the amps accept. The Master fader is a relative control on the `Master` group, as R1's
AutoCreate builds one. It moves every channel by the same amount, keeping their balance, and each
channel stops at the amp's limits. Its span matches the channels', so it can take the whole system
down to the bottom or 6 dB up.

The output meter is R1's GR/Headroom meter. 0 dB is full output, below that is headroom left, and
above is gain reduction. The input meter shows the input peak in dBu. Its −60 to +25 dBu range and
+19 dBu threshold are my choices, not values read from R1, so adjust them in R1's control
properties if they look wrong.

## Linked pairs

R1 can't tie two fader controls together, but a fader can drive a group. So `fader_view.py` adds a
folder of groups called `Faders links` at the top of the group tree, beside `Master` rather than
inside it, with one group per pair. Each pair's fader drives its group absolutely: move it and both
sides go to the same level, as with a console's stereo link. If you've set L and R apart on purpose,
the first move matches them. Pairs are matched in order within each Tap: the first Left with the
first Right, the second with the second.

The groups sit outside `Master` because, inside it, a channel would be listed twice under `Master`
and the relative Master fader could move it twice. `check.py` fails any added group that ends up
inside `Master`.

## The web tool: R1 Layout Builder

`web/` ([r1-layout.stoatworks-labs.com](https://r1-layout.stoatworks-labs.com)) does the same job in a browser: drop in a `.dbpr`, choose the pages, download a copy with the
views added. It runs entirely in the page (SQLite compiled to WebAssembly), so the project never
leaves the machine. It writes the same rows the scripts do. The tests prove its Taps and Faders
pages come out identical to `tap_view.py` and `fader_view.py` (linked or `--no-link`), row for row,
and it runs its own copy of `check.py` before it offers the download.

| Page | What's on it |
| --- | --- |
| **Master** | A Master card in AutoCreate's layout (Mute and Power both ask first, ±12 dB relative level), plus delay on and relative delay, and a card with the project's name and size. Then one row per section: the group's own controls and a Channel control for each of its channels. |
| **Timing** | A row per channel with mute, delay on and time, GR and the frequency generator; a header per section with its relative delay; a Master row on top. For walking the room with a measurement mic. |
| **EQ & tuning** | R1's EQ control for Master and for each section, with EQ 1 / EQ 2 switches, then a tuning row per channel: level, CUT, CPL, the EQ switches and GR. |
| **Faders** | `fader_view.py`'s page, linked pairs and all (or not, if you untick it), plus a fader per section, mutes and, optionally, input meters. |
| **Strips** | `tap_view.py`'s Taps page, with any strip from the designer in place of the stock card. |
| **Floorplan** | A picture you upload (a CAD export, a photo of the venue plan) as the background, with a tile where each speaker actually is. Black-on-white plans are inverted for R1's dark theme, and R1's night scheme gets a darker copy. |

A **section** is a group from the project's tree. The default is every `Tap …` group, falling
back to Master's children; the Sections tab picks any others and their order.

The **strip designer** builds the set of controls one channel (or one group) gets, by dragging
them around a canvas. The built-in strips are read-only; duplicate one to edit it. A strip is
then used by the Strips, Timing, Master and Floorplan pages for every channel or section. Strips
and page settings are saved in the browser, per project file name; the floorplan picture isn't.

Choices the tool makes, which you may want to argue with:

- **EQ banks.** The Master EQ goes on EQ 2 and the sections' EQs on EQ 1, the bank AutoCreate's
  EQ views use, so tuning the system and tuning a section don't overwrite each other. AutoCreate
  puts its own EQ controls on groups too, but what one does to members that start out with
  different curves is unverified. I've assumed it gives them all the same curve, so mixed groups
  (tops and subs together) want care. No R1-written file has yet been seen with an EQ control on
  EQ 2.
- **CUT and CPL on a group** only when every channel in it is the same speaker. A mixed group
  gets them per channel instead.
- **Filter 1's label** is "100Hz" when the channel's name contains "sub", otherwise "CUT". The amp
  decides what Filter 1 does; the label is a guess from the name.
- **Delay limits** (`tap_view.py` does the same). A D6 or D12 channel's delay stops at 340 ms,
  other amps' at 10 s. A group's relative delay spans ± the smallest limit among its channels,
  less 0.5 ms. AutoCreate wrote ±339.5 on one rig's Master, which has D6s under it, and ±9999.5
  on an all-D40 rig. Those two files can't tell "smallest in the group" from "smallest in the
  project", so a D20-only Tap on a rig that also has D6s gets ±9999.5 here. That's what a D20
  accepts, but it's my reading rather than AutoCreate's. The file R1 opened was built before
  this, with ±339.5 on every Tap.

```bash
cd web && npm ci && npm run dev
```

```bash
cd web && npm test
```

The tests build pages from a synthetic project (`test/fixture.ts`; no real project is in git) and
check them with both checkers. They need Python 3 for the parity tests, and the installed R1 for
the catalogue check, which is skipped without it. Real projects never go in git, but you can
run the tests on your own: list them in `R1_REAL_PROJECTS`, separated by colons. They're only read.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->
