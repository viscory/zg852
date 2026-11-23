# Design critique

This file records visual critiques of 就腳. The newest critique is first. Change `src/styles.css` so the page matches the newest sizes. Keep one size scale on `:root`.

## 2026-11-23 Beta badge

The header starts with a Beta badge. It is the first control in the top right bar. Pressing it turns beta features on or off. The tooltip says which features that enables. Today that is interest preferences, which can change the areas on the map. The options panel does not repeat the badge, the switch, or the experimental note. The interest sliders appear only while the badge is on.

## 2026-11-23 Header icons

The language control shows the language name and is wider than the saved-people button. Share sits under the search button.

The header has three buttons of one size. They are saved people, share, and language. Each button is `--field` on both sides. Each icon is 12px. The language button shows the globe only. The language name stays in the open menu. Share is not in a sidebar.

The left sidebar does not scroll sideways. Tooltips on the right edge of a panel open toward the inside, so they do not widen the panel. A text field uses `min-width: 0` so the field can shrink inside the panel.

## 2026-11-23 Compact chrome

The icons and boxes are too large. A 44px field and a 44px icon button fill the side panels.

The compact scale is:

- `--icon` is 12px. Header icon buttons use that size. Card action icons, chip icons, and the search icon are 14px. Legend key icons stay 12px.
- `--field` is 36px. Text inputs, icon buttons, the locale control, focus options, the search button, directory action buttons, and the map zoom and recenter controls use this height.
- `--header` is 52px. The logo is 28px. The title is 17px on a wide screen and 16px below 900px.
- A person avatar is 24px. A card has 8px padding. A category chip is 32px tall. The full-width add control uses `--field`.
- Body text stays 14px. The inline note icon button stays 24px.
- Side column widths stay 360px and 340px.

The page is a column. The header uses its content height. The layout fills the space that remains. A wrapped phone header does not use a fixed offset.

Add the next critique above this section. Name the part that is wrong and the size you want.
