# Agent Deck

A local browser workspace for running several agent CLIs and shells in one saved, resizable desk.

<video src="https://raw.githubusercontent.com/wr-web/agent-deck/main/docs/demo.mp4" width="100%" controls muted autoplay loop></video>

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

For a production build:

```bash
npm run build
npm start
```

Open `http://127.0.0.1:4317`.

## Controls

- **New** creates a desk with one terminal using your `$SHELL` configuration.
- **Split** enters layout editing. Move over a pane to position the cut, left-click to stage it, right-click to switch between vertical and horizontal cuts, and press `Enter` to commit.
- Drag a divider when not editing to resize panes.
- **Store** or `Cmd/Ctrl+S` saves the layout, current directory, detected foreground command, and agent resume command.
- **Load** restores the layout. PTYs remain live while the Agent Deck server is running; after a server restart, stored resume commands start in their captured directories.
- Use the right-side pane tabs to focus a terminal. Pane settings let you edit its label, directory, or resume command.

Saved desks are written to `data/desks.json`. The server only listens on `127.0.0.1`.

## Privacy

Saved desk data can contain local paths, foreground commands, and agent session identifiers. `data/desks.json` is excluded from Git; keep it local and review it before sharing diagnostics or archives.
