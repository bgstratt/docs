# Protocol inspector playground

## Purpose

Phase C playground for inspecting runtime websocket traffic without reading source code first.

Current capabilities:

- connect/disconnect room sessions
- live runtime event stream capture
- message type filtering
- type frequency summary
- raw payload inspection for selected events

## Run locally

1. Start host on `http://127.0.0.1:5074`.
2. In this folder:
   - `npm install`
   - `npm run dev`
3. Open printed Vite URL.
4. Connect to room and generate activity from another app surface.

## Validation checklist

- Connection reaches open state.
- Incoming message types appear in stream.
- Type filter narrows stream list.
- Selecting an event shows raw payload.
