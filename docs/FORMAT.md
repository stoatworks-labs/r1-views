# The .dbpr format, as far as remote views go

These notes come from reading one project written by R1 3.46.1 / ArrayCalc 10.26.0 (`DbVersion`
3.0, `Controls` table version 6.2), plus R1 3.46.1's own data files. Any other version is
unverified.

## The file

A `.dbpr` is plain SQLite with no encryption, UTF-8, 4096-byte pages and a rollback journal
(`journal_mode=delete`). Its triggers clean up after deletes: removing an amp channel unbinds its
controls and drops its groups, and so on. They only matter if you delete rows, and these scripts
only ever insert. `TableVersions` records each table's schema version, so check it first when a
newer R1 shows up.

## What to read

| Table | Use |
| --- | --- |
| `Devices` | `DeviceId`, `Model` (D6, D20…), `RemoteIdSubnet`.`RemoteIdDevice`, `Name` |
| `AmplifierChannels` | `(DeviceId, AmplifierChannel)` → channel `Name` |
| `Groups` | The group tree, linked through `ParentId`. `Type 0` is a folder: the root `Groups`, then `Master`, then groups such as `Tap 1`. `Type 1` is an amp channel, with `TargetId` = DeviceId and `TargetChannel` = channel. |
| `Cabinets` | Channel → `SpeakerId` and source group (from ArrayCalc) |
| `Views` | Every view. User remote views are `Type 1000` (see `ViewTypes`). |
| `Controls` | Every widget on every view |

## A new group

One `Type 0` row (`TargetId 0`, `TargetChannel -1`, `Flags 0`) under its parent, then one `Type 1`
row per amp channel (`Name` = channel name, `TargetId` = DeviceId, `TargetChannel` = channel,
`Flags 0`), exactly as R1 writes them. The root `Groups` row has `ParentId 0` and `Flags 1`. A
channel can be in several groups, but keep new groups out of `Master`: a channel listed twice under
it would be moved twice by a relative Master control. A fader on a group is absolute with `Flags 6`
(every member set to the fader's value) or relative with `Flags 14` (every member moved by the
same amount). How R1 draws an absolute group fader whose members differ is unverified.

## A new remote view

One row in `Views`:

| Column | Value |
| --- | --- |
| `Type` | 1000 |
| `Name` | the tab name |
| `Icon` | thumbnail: 4 bytes (`00000001`) and then a 242 × 136 PNG. Copying another view's icon is fine: R1 draws its own when it saves. |
| `Flags` | 6 = listed in the nav bar (`Overview` uses 4 and has `NaviBarIndex -1`) |
| `HomeViewIndex`, `NaviBarIndex` | max + 1 of the existing values |
| `HRes`, `VRes` | canvas size in pixels |
| `ZoomLevel` | 100 |
| `ScalingFactor`, `ScalingPosX`, `ScalingPosY`, `ReferenceVenueObjectId` | NULL |

`ViewId` is AUTOINCREMENT; let SQLite assign it.

## Controls

Positions are absolute view pixels. Columns every control shares:

| Column | Value |
| --- | --- |
| `Font` | TEXT `Arial,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1` (Qt `QFont::toString`; R1's templates use `Arial,9`) |
| `Dimension` | BLOB `0000000000000000FFFFFFFFFFFFFFFF`, as the project had it. R1 3.46.1 rewrites every control's to `00000001000000010000000100000001` when it saves, its own included, so either is accepted. |
| `LabelFont` | 5 |
| `LineThickness`, `ThresholdValue` | 0, 0.0 |
| `UniqueName`, `ConfirmOnMsg`, `ConfirmOffMsg` | NULL (Mute and Power prompts put text in the Confirm messages) |
| `PictureIdDay`, `PictureIdNight`, `LogoId` | 0; a Picture control's are the `PictureId`s of its day and night images |
| `JoinedId` | Controls that move as one unit share it (a template instance, an AutoCreate block). Use max + 1 for each new unit. |
| `LabelAlignment` | Qt alignment for where the label sits: 1 = left of the control, 64 = below it |
| `Alignment` | Qt alignment of text inside: 129 left, 130 right, 132 centred |

How a control is bound:

| To | `ActionType` | `TargetType` | `TargetId` | `TargetChannel` | `TargetRecord` |
| --- | --- | --- | --- | --- | --- |
| an amp channel | 1 | 2 (Direct access) | DeviceId | channel | 0 (Channel control: 65535) |
| a group | 1 | 0 (Group) | GroupId | -1 | 0 |
| nothing (frames, labels) | 0 | -1 | 0 | -1 | 65535 |

The control types used so far (the full list is in the project's `ControlTypes`):

| `Type` | Control | Size | Notes |
| --- | --- | --- | --- |
| 1 | Channel | 172 × 98, fixed | `DisplayName` NULL, `TargetProperty ''`, colours 1/1/1 as R1 3.46.1 drops one in; shows speaker, remote ID, ISP/GR/OVL, level, mute, name |
| 2 | Fader | 100 × 154 in templates; any size (80 × 794 used) | `Flags 6`, or `Flags 14` relative on a group; colours 5/1; label below |
| 3 | Digital | 100–120 × 24 | `Flags 6`, or `Flags 14` for a relative group control; colours -1/-1, `LabelColor 1` |
| 4 | Switch | 52 × 52 or ~100 × 24 | `Flags 262`, limits 0..1; `Flags 3334` + Confirm messages asks first |
| 5 | List | 110–120 × 24 | `Flags 6`, limits 0/0 |
| 7 | Meter | 10–20 wide, any height | `Flags 166`, colours from GuiInfo (main / sub = over the threshold), `LabelColor 1`, label below; `ThresholdValue` marks where the sub colour starts (meaning unverified) |
| 8 | LED | 20 × 20 | `Flags 6`, `ThresholdValue 1.0`, limits 0/0, label right (`LabelAlignment 2`) |
| 6 | EQ | 554 × 426 | As AutoCreate's EQ views place it (an all-D40 project's `Array 1 EQ`, on a group): `Flags 6`, limits 0..1, colours -1/-1, `LabelColor 0`, `TargetProperty` = the bank, `Config_Eq1Enable` or `Config_Eq2Enable` |
| 9 | Display | ~90 × 24 | Live text such as `Config_ChannelName`: `Flags 6`, colours -1/-1, `LabelColor 1`, as templates.r2t's `MatrixInput_ChannelName` |
| 11 | Label | any | Static text, as AutoCreate writes the project name on its Overview: `Flags 6`, `MainColor 19`, `SubColor 1`, `LabelColor 0`, `ActionType 0`, `TargetType -1`, `TargetRecord 65535`; the text is its `DisplayName` |
| 12 | Frame | any | `Flags 70`, `LabelColor 19`, `MainColor 14` (Master-style) or 4 (Group-style), `SubColor 1`, `Alignment 129`; its `DisplayName` is the title |
| 14 | Picture | any | As templates.r2t's 27 room pictures: `Flags 38`, colours 1/1/1, `ActionType 0`, `TargetType -1`, `TargetProperty` NULL, `TargetRecord 65535`, `PictureIdDay`/`PictureIdNight` = rows in `Pictures`. R1's help says a background image is one use. Whether R1 draws it under the controls placed after it is unverified. |

## Properties

`TargetProperty` is R1's object name. These were used and checked against `GuiInfo.db`:

| Property | Control | Range | Means |
| --- | --- | --- | --- |
| `Config_Mute` | Switch | 0..1 | Channel mute |
| `Config_DelayOn` | Switch | 0..1 | Delay on |
| `ChStatus_MsDelay` | Digital | 0.3 ms up to the amp's limit; relative on a group, ± the smallest member's limit less 0.5 | Delay time. AutoCreate gives one project's Master (D6s and D20s) ±339.5 and an all-D40 project's groups ±9999.5, so a D6's limit is taken to be 340 ms, and a D12's (same family) too: inferred, not read from d&b. Neither file shows whether AutoCreate takes the smallest limit in the group or in the whole project; `r1db.View.rel_delay` and the web tool take the group's. |
| `Config_FreqGenMode` | List | Off / Sine / Pink | Frequency generator |
| `Config_FreqGenFreq` | Digital | 10–20000 Hz | Generator frequency |
| `Config_FreqGenLevel` | Digital | −57.5 to +6 dBu | Generator level |
| `Config_PotiLevel` | Fader | −57.5 to +6 dB (the amps' range, 0.5 dB steps); ±12 relative in AutoCreate | Level |
| `ChStatus_GrHead` | Meter | −32 to +32 dB (R1 help 7.4.4) | Output: GR/Headroom; 0 = full output, above = gain reduction |
| `ChStatus_InputVoltagePeak` | Meter | dBu; −60 to +25 is my guess | Input peak (`ChStatus_InputVoltage` is the plain level) |
| `ChStatus_Gr` | LED | | Gain reduction (also `ChStatus_Isp`, `ChStatus_Ovl`) |
| `ArrayProcessing_Enable` | LED / Switch | `TargetRecord` = slot 1–10 | AP slot enabled; there is no single per-channel AP flag |
| `Config_Filter1` | Switch | 0..1 | CUT on a top; 100Hz / Infra on a sub. The amp's speaker setup decides which; the label on the switch is a guess from the channel's name |
| `Config_Filter2` | Switch | 0..1 | HFA |
| `Config_Filter3` | Digital | −9 to +5 dB, as AutoCreate writes it | CPL |
| `Config_Eq1Enable`, `Config_Eq2Enable` | EQ / Switch | 0..1 | The EQ control for that bank, or its on/off switch (`Config_EqsEnabled` switches both). No R1-written file has yet been seen with an EQ control on bank 2 |
| `Config_ChannelName` | Display | | The channel's name |
| `Settings_PwrOn` | Switch | | Power |

**ArrayProcessing** is switched per slot. A channel's slots are the `ArrayProcessingSlots` rows
for its cabinet's `SourceGroupId` (`Cabinets.DeviceId/AmplifierChannel` → `SourceGroupId`). A
channel can drive more than one cabinet (one row of an all-D40 project has two per channel), so take each
slot once. R1's ArrayProcessing template binds one control per slot with `TargetRecord` =
`Slot`. A project with no slots has nothing to show.

The frequency generator is per channel (R1 help 7.4.5). R1's help lists it for every amp. On an amp
that turns out not to have it, R1 should grey the controls out rather than refuse the file, but
that is unverified.

## Pictures

`Pictures(PictureId, Name, Comment, PictureData)` holds the images. `PictureData` is a Qt
`QImage` written by `QDataStream`: a 32-bit 1, then the image as PNG (`00000001 89504E47…`), the
same as a view's `Icon`. templates.r2t's room pictures are stored that way, with one picture for
both colour schemes. The web tool adds a darker second picture for R1's night scheme when it can.
`check.py` allows new `Pictures` rows only when a new Picture control uses them.

## What R1 does when it saves

Read from a real D20 and D6 project after R1 3.46.1 opened the generated file and saved it
(5 November 2026):

- **Kept:** every generated control, field for field, apart from the two below; every group,
  including the linked-pair groups; the new views' names, sizes, flags and order.
- **Rewritten:** `Controls` wholesale, so `ControlId`s are renumbered (the next one is the row
  count plus one). Don't hold on to a ControlId across an R1 save. `Dimension` on every control,
  as above. `TargetProperty` on Channel controls goes from `''` to NULL; the project already had both.
- **Redrawn:** the `Icon` of each remote view, from the page itself.
- **Renumbered:** `HomeViewIndex` and `NaviBarIndex`, closing the gaps but keeping the order.
- **Dropped:** the hidden system views (`Type` 4 and 12–17, `Flags 0`: Service, Snapshots, Log
  and so on). R1 makes them again when it needs them. A half-built user view, `Remote view 15`,
  also went, and nothing says whether R1 or the person at the keyboard removed it.
- **Added:** a `SourceGroups` row, `Unused channels` (`Type 5`), and a new `AuthorDateTime`.

So `check.py` will fail on a file R1 has saved, because views went missing. Compare against R1's
saved copy, not the original, after that.

## R1's own data, inside `/Applications/R1 V3.app/Contents/`

| File | What it is |
| --- | --- |
| `MacOS/GuiInfo.db` | Plain SQLite. `ControlsAndFunctions` holds every valid (property, control type) pair, with default colours. `check.py` tests against it. |
| `MacOS/templates.r2t` | Plain SQLite. The d&b templates (`Sections` tree; `Controls` rows grouped by `JoinedId`): TOPs = 7, Point sources = 8, SUBs = 9, Freq. Generator = 13, Master = 6. Copy field values from here. |
| `docs/R1-Help.html` | The manual |
| `MacOS/DbRemLib.db3`, `MacOS/DspData.sqlite` | Encrypted, so no use |
