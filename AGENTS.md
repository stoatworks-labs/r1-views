# AGENTS.md — r1-views

- **Never write to the input `.dbpr`.** Copy it, then insert into the copy. A project file is
  someone's show.
- **Insert only.** The project's triggers cascade deletes through groups, controls and snapshots.
  A script may add views, controls on its own views, and new groups (for linked faders). Every row
  that was already there stays byte-identical, and `check.py` enforces that.
- **Never add a group inside `Master`.** A channel listed twice under it would be moved twice by a
  relative Master fader. New groups go under the root.
- **Copy values from R1, don't invent them.** Field values for a control come from
  `templates.r2t` or from rows R1 itself wrote into a project. Every (property, control type)
  pair must exist in `GuiInfo.db`'s `ControlsAndFunctions`.
- **R1 is the real test.** `check.py` passing means the file is consistent, not that R1 accepts
  it. Say what has actually been opened in R1, and with which version, in the README's status
  line. Never say a file works because it compiles or checks.
- **Project files stay out of git** (`.gitignore`). They hold client venues and a password hash.
  If a test fixture is needed, build a synthetic one.
- **The web tool's engine is a port of the scripts** (`web/src/engine`, after `r1db.py`). Change
  a page in one and change it in the other: `web/test/parity.test.ts` compares their output as SQL
  dumps and must keep passing. `web/src/engine/check.ts` is `check.py`'s twin, kept in step the
  same way.
- Scripts that read untrusted project files run with `python3 -I`.
