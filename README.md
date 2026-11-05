# Red v Blue

A territory strategy game on the 2024 U.S. county map. Play it at the Vercel link in the repo description.

Every county takes the color of the party that won it in the 2024 presidential race. Within each state, neighboring counties that voted the same way are merged into one region, giving 246 regions: 66 red and 180 blue. Both sides play by identical rules. The one setting that changes is what the land pays:

| Income by | Red share at start | Computer vs computer (60 games) |
|-----------|-------------------|----------------------------------|
| Land      | 88%               | Red 60, Blue 0                   |
| Counties  | 86%               | Red 58, Blue 2                   |
| Voters    | 51%               | Red 6, Blue 54                   |

## Rules

- Every region starts with 3 armies.
- Each turn a side gets 3 armies, plus its share of 30 by the chosen income measure, plus 1 per whole state held.
- Drag from your region onto a neighbor to attack. Risk-style dice: up to 3 attacking dice against up to 2 defending, ties to the defender. A drag keeps rolling until one side breaks.
- Once per turn, move armies between two of your regions connected through your own territory. Moving ends the turn.
- A side holding fewer than 25 regions (10% of the map) collapses.

## Data

- County results: [tonmcg/US_County_Level_Election_Results_08-24](https://github.com/tonmcg/US_County_Level_Election_Results_08-24) (2024 presidential).
- Shapes: U.S. Census Bureau cartographic boundaries via [us-atlas](https://github.com/topojson/us-atlas).
- Alaska and Connecticut don't report presidential results by county, so each is one statewide region. Kalawao County, HI is counted with Maui.

## Building

`index.html` is the whole game and is committed ready to serve. To rebuild it:

```
npm install
node build/data.mjs     # data/county2024.csv + us-atlas -> data/regions.json
node build/build.mjs    # engine + data + AI-vs-AI results -> index.html
node build/sim.mjs 60   # balance check only
```

Source: `src/engine.js` (rules and computer player) and `src/index.template.html` (the page).
