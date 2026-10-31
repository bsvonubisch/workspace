# Control Room

A personal creative workspace with projects containing chats, slide decks, whiteboards, HTML apps, cloud-agent runs, and schedules.

## Run locally

Requires Node.js 22 or newer, and Codex installed on your PATH and signed in with `codex login`. No npm dependencies are required.

```sh
node server.mjs
```

Open http://127.0.0.1:4318. Windows users can also run `Start-Control-Room.ps1` from PowerShell. Keep the companion running to use AI or dispatch scheduled tasks. Stop it with Ctrl+C. Set `CONTROL_ROOM_CODEX_PATH` if the Codex executable is not on PATH.

## What is included

- Project selector and project-specific Chat, Slides, Whiteboard, Apps, Cloud agents, Schedules, and Prompt library views.
- Editable slide decks with standalone HTML export and a sandboxed HTML app editor.
- An original SVG whiteboard implementation: sketch-style shapes, arrows, freehand drawing, text, sticky notes, select/move/resize, pan/zoom, undo/redo, duplicate/copy, and SVG/JSON import/export. It does not embed Excalidraw.
- Prompt-driven generation through the installed Codex CLI, using its existing sign-in. Each request receives the selected item's context and project name; it does not inherit the chat that created this application.
- Cloud task submission and environment task-status retrieval through `codex cloud`.
- Durable once/daily/weekly schedules, timezone-aware dispatch, pause/resume, and run history.
- Browser workspace export/import, including migration of older work into a parent project.

## Cloud setup and scheduling

Publish a Codex Cloud environment in your account. In the project's **Cloud agents** view, save its environment ID and optional branch. Cloud tasks operate in that environment's repositories; local canvases are not automatically uploaded.

The scheduler is a **local dispatcher**: this computer must be awake and the companion running when a task is due. Once submitted, execution continues in Codex Cloud independently. After downtime, a missed schedule dispatches once rather than replaying every missed occurrence. Unknown submission outcomes pause automatic retries to avoid duplicates. These schedules are separate from ChatGPT's Scheduled tasks.

No environment, task, or schedule is preconfigured. Cloud submission still needs end-to-end verification against a runnable environment in your account.

## Data and controls

Project content and prompts use browser localStorage. Export backups regularly. The hosted and local URLs have separate storage; use export/import to transfer work.

Environment configuration, schedules, and run history are stored in `.control-room-data/cloud.json` beside the server. This directory is ignored by Git, is not served over HTTP, and is not included in browser workspace exports. Back it up separately when moving the companion. Authentication stays with Codex; this app does not read or copy its credential files.

The companion listens on loopback only and validates Host and Origin for mutations. Content generation uses a read-only Codex sandbox. HTML previews use an isolated iframe with network access blocked. Google Drive, Notion, GitHub, Slack, and MCP integration cards are setup information, not active connections.

## Source map

- `public/` — the complete dependency-free browser application.
- `public/board.js` and `public/board.css` — original drawing engine and controls.
- `server.mjs` — static serving and local Codex generation.
- `cloud.mjs` — Codex Cloud adapter and persistent scheduling.
- `tests/` — project migration/scoping, drawing geometry/serialization, schedule/timezone, and dispatcher recovery tests.

Run checks without installing packages:

```sh
node tests/workspace.test.mjs
node tests/dispatcher.test.mjs
```

Dispatcher tests use a local fixture and never submit real cloud tasks. UI appearance and pointer interactions still need browser verification.

## Hosting

The browser app can be hosted as static files from `public/`. Hosted editing works, but the local Codex and scheduling routes require the companion at the local URL. Publishing to GitHub does not automatically deploy changes to the existing Sites publication.
