# Attributions

r1-views is built on other people's work. This file lists what that work is, who did
it, and what it is doing here.

It is generated — the master lists live in the `stoatworks-backend` repo and are
pushed out by `scripts/sync-attributions.py`. Edit it there, not here.

## Third-party code this project uses

Libraries, SDKs and frameworks the project is built on or bundles.

### React

<https://react.dev>  
Licence: MIT  
Copyright: Meta Platforms, Inc. and affiliates

An npm dependency.

The UI layer for the browser tools and the Electron and Tauri front ends.

### The npm ecosystem

<https://www.npmjs.com>  
Licence: predominantly MIT  
Copyright: the individual package authors

npm dependencies, resolved and pinned in the lockfile.

Build tooling, test runners and the libraries the front ends are assembled from. The exact set and versions for any build are in that repo's lockfile, which is the authoritative list.

The full transitive dependency set for any build is pinned in this repo's lockfile,
which is the authoritative list. What is named above is the layers a reader would
want to know about, not every package that has ever been resolved.

## Work we checked ourselves against

No code was taken from these — but they were how we knew we had it right, and that is worth saying out loud.

### d&b R1 3.46.1: its control templates, control catalogue and help — d&b audiotechnik

The .dbpr project format is SQLite with no published schema. What each remote-view control should hold was read out of R1 3.46.1 itself: the controls in its templates.r2t, the property each control type accepts in its GuiInfo.db (web/src/engine/catalogue.ts is that list), rows R1 wrote into projects, and R1's help. Field values are copied from those rather than invented, and the D6 and D12 delay limit was inferred from AutoCreate's own pages. R1 3.46.1 has opened a file from the r1-views scripts and saved it back with every control and group intact. Not affiliated with d&b audiotechnik.

## Getting this wrong

If your work is here and the description is inaccurate, the licence is wrong, or you would rather not be listed — open an issue and it will be fixed.
