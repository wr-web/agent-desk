import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { deleteDeck, getDeck, listDecks, saveDeck } from "./store.js";
import { attachClient, killDeck, killSession, listOpenCodeSessions, snapshotSession } from "./pty-manager.js";
import type { Deck, LayoutNode, TerminalSnapshot } from "./types.js";

const app = express();
const port = Number(process.env.PORT || 4317);
app.use(express.json({ limit: "1mb" }));

const paneIds = (node: LayoutNode): string[] =>
  node.type === "pane" ? [node.id] : [...paneIds(node.first), ...paneIds(node.second)];

app.get("/api/health", (_request, response) => response.json({ ok: true, shell: process.env.SHELL || "/bin/zsh" }));

app.get("/api/decks", async (_request, response, next) => {
  try {
    response.json(await listDecks());
  } catch (error) {
    next(error);
  }
});

app.get("/api/opencode/sessions", async (request, response, next) => {
  try {
    const cwd = typeof request.query.cwd === "string" ? request.query.cwd : "";
    if (!cwd) return response.status(400).json({ error: "Missing cwd" });
    response.json(await listOpenCodeSessions(cwd));
  } catch (error) {
    next(error);
  }
});

app.post("/api/decks", async (request, response, next) => {
  try {
    const id = crypto.randomUUID();
    const paneId = crypto.randomUUID();
    const now = new Date().toISOString();
    const deck: Deck = {
      id,
      name: typeof request.body?.name === "string" && request.body.name.trim() ? request.body.name.trim() : "Untitled deck",
      createdAt: now,
      updatedAt: now,
      layout: { type: "pane", id: paneId },
      terminals: {
        [paneId]: { id: paneId, title: "Shell 1", cwd: os.homedir(), command: "", resumeCommand: "" },
      },
    };
    await saveDeck(deck);
    response.status(201).json(deck);
  } catch (error) {
    next(error);
  }
});

app.get("/api/decks/:id", async (request, response, next) => {
  try {
    const deck = await getDeck(request.params.id);
    if (!deck) return response.status(404).json({ error: "Deck not found" });
    response.json(deck);
  } catch (error) {
    next(error);
  }
});

app.put("/api/decks/:id", async (request, response, next) => {
  try {
    const current = await getDeck(request.params.id);
    if (!current) return response.status(404).json({ error: "Deck not found" });
    const layout = request.body.layout as LayoutNode;
    const incoming = (request.body.terminals || {}) as Record<string, TerminalSnapshot>;
    const ids = paneIds(layout);
    const removed = paneIds(current.layout).filter((id) => !ids.includes(id));
    removed.forEach((id) => killSession(current.id, id));
    const snapshots = await Promise.all(
      ids.map(async (id, index) => {
        const pane = incoming[id] || current.terminals[id] || {
          id,
          title: `Shell ${index + 1}`,
          cwd: os.homedir(),
          command: "",
          resumeCommand: "",
        };
        return snapshotSession(current.id, pane);
      }),
    );
    const deck: Deck = {
      ...current,
      name: typeof request.body.name === "string" ? request.body.name.trim() || current.name : current.name,
      updatedAt: new Date().toISOString(),
      layout,
      terminals: Object.fromEntries(snapshots.map((pane) => [pane.id, pane])),
    };
    await saveDeck(deck);
    response.json(deck);
  } catch (error) {
    next(error);
  }
});

app.post("/api/decks/:id/recreate", async (request, response, next) => {
  try {
    const deck = await getDeck(request.params.id);
    if (!deck) return response.status(404).json({ error: "Deck not found" });
    killDeck(deck.id);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/decks/:id", async (request, response, next) => {
  try {
    killDeck(request.params.id);
    await deleteDeck(request.params.id);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV === "production") {
  const root = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.resolve(root, "../dist")));
  app.get("*splat", (_request, response) => response.sendFile(path.resolve(root, "../dist/index.html")));
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Agent Deck server: http://127.0.0.1:${port}`);
});

const webSockets = new WebSocketServer({ server, path: "/ws" });
webSockets.on("connection", async (socket, request) => {
  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const deckId = url.searchParams.get("deck");
    const paneId = url.searchParams.get("pane");
    if (!deckId || !paneId) return socket.close(1008, "Missing deck or pane");
    const deck = await getDeck(deckId);
    const pane = deck?.terminals[paneId];
    if (!deck || !pane) return socket.close(1008, "Unknown deck or pane");
    attachClient(deckId, pane, socket);
  } catch {
    if (socket.readyState === socket.OPEN) socket.close(1011, "Internal error");
  }
});
