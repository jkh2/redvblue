# Red v Blue

A county war on the map the 2026 midterm just drew.

Every county starts with the party that won that state's governor's office. Texas, Georgia, Ohio, Iowa, and Nevada changed hands. Alaska and Kansas were not called on November 5, so they start with whoever was leading. Winners are not sworn in until January. This is the board the election made, not the offices people still sit in.

You do not get a state for winning it. You take it one county at a time.

**[Play Red v Blue](https://redvblue-zeta.vercel.app/)**

## How a turn goes

Eight columns a side, set on the real front. Both sides raise eight armies a turn.

1. Put the armies on your columns.
2. Fight. A column may enter two neighboring enemy counties. Risk dice, up to 3 against 2, ties to the defender. An empty county is a militia of one. Take it and the column walks in, leaving one behind. Break an enemy column and it is gone.
3. March. Each column may walk up to six counties through your own ground.

Finish a whole state and that column is reinforced. Break every enemy column and you win. Otherwise, after twelve turns, the side that took more counties wins.

Drag to pan. Scroll to zoom. Click a column, then the county you want.

## Data

- Counties: U.S. Census Bureau 2023 cartographic boundaries, the same file Held Ground uses.
- Governor's offices: called results as of 2:00 p.m. ET, November 5, 2026, plus the leader in Alaska (Jonathan Kreiss-Tomkins) and Kansas (Cindy Holscher).
- Rebuild the board with `node build/board.mjs` after `npm install`. The page itself is static.
