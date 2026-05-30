# Collab maps demo

## Purpose

Flagship Phase B demo that proves shared, spatial collaboration behavior using sdk/wasm package mode.

This slice introduces a real interaction path:

- shared pin placement on a map board
- shared state stored in sdk sync key `maps/pins`
- diagnostics panel for room/runtime visibility

## Run locally

1. Start host on `http://127.0.0.1:5074`.
2. In this folder:
   - `npm install`
   - `npm run dev`
3. Open printed Vite URL.
4. Connect to a room and click board to add pins.

## Validation checklist

- Room connection reaches open state.
- Pin click creates marker and logs last action.
- Pins list updates and persists in shared sdk state key.
- Diagnostics panel captures runtime lifecycle transitions.
