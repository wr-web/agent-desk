import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { deleteDesk, getDesk, listDesks, saveDesk } from "./store.js";
import { attachClient, killDesk, killSession, listOpenCodeSessions, snapshotSession } from "./pty-manager.js";
import type { Desk, LayoutNode, TerminalSnapshot } from "./types.js";

const app = express();
const port = Number(process.env.PORT || 4317);
app.use(express.json({ limit: "1mb" }));

const paneIds = (node: LayoutNode): string[] =>
  node.type === "pane" ? [node.id] : [...paneIds(node.first), ...paneIds(node.second)];

app.get("/api/health", (_request, response) => response.json({ ok: true, shell: process.env.SHELL || "/bin/zsh" }));

app.get("/api/desks", async (_request, response, next) => {
  try {
    response.json(await listDesks());
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

app.post("/api/desks", async (request, response, next) => {
  try {
    const id = crypto.randomUUID();
    const paneId = crypto.randomUUID();
    const now = new Date().toISOString();
    const desk: Desk = {
      id,
      name: typeof request.body?.name === "string" && request.body.name.trim() ? request.body.name.trim() : "Untitled desk",
      createdAt: now,
      updatedAt: now,
      layout: { type: "pane", id: paneId },
      terminals: {
        [paneId]: { id: paneId, title: "Shell 1", cwd: os.homedir(), command: "", resumeCommand: "" },
      },
    };
    await saveDesk(desk);
    response.status(201).json(desk);
  } catch (error) {
    next(error);
  }
});

app.get("/api/desks/:id", async (request, response, next) => {
  try {
    const desk = await getDesk(request.params.id);
    if (!desk) return response.status(404).json({ error: "Desk not found" });
    response.json(desk);
  } catch (error) {
    next(error);
  }
});

app.put("/api/desks/:id", async (request, response, next) => {
  try {
    const current = await getDesk(request.params.id);
    if (!current) return response.status(404).json({ error: "Desk not found" });
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
    const desk: Desk = {
      ...current,
      name: typeof request.body.name === "string" ? request.body.name.trim() || current.name : current.name,
      updatedAt: new Date().toISOString(),
      layout,
      terminals: Object.fromEntries(snapshots.map((pane) => [pane.id, pane])),
    };
    await saveDesk(desk);
    response.json(desk);
  } catch (error) {
    next(error);
  }
});

app.post("/api/desks/:id/recreate", async (request, response, next) => {
  try {
    const desk = await getDesk(request.params.id);
    if (!desk) return response.status(404).json({ error: "Desk not found" });
    killDesk(desk.id);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/desks/:id", async (request, response, next) => {
  try {
    killDesk(request.params.id);
    await deleteDesk(request.params.id);
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
  console.log(`Agent Desk server: http://127.0.0.1:${port}`);
});

const webSockets = new WebSocketServer({ server, path: "/ws" });
webSockets.on("connection", async (socket, request) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const deskId = url.searchParams.get("desk");
  const paneId = url.searchParams.get("pane");
  if (!deskId || !paneId) return socket.close(1008, "Missing desk or pane");
  const desk = await getDesk(deskId);
  const pane = desk?.terminals[paneId];
  if (!desk || !pane) return socket.close(1008, "Unknown desk or pane");
  attachClient(deskId, pane, socket);
});
