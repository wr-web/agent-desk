import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(root, "../data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "sessions.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS pane_sessions (
    deck_id TEXT NOT NULL,
    pane_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    session_id TEXT NOT NULL DEFAULT '',
    cwd TEXT NOT NULL,
    command TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (deck_id, pane_id)
  );
`);

const stmtUpsert = db.prepare(
  `INSERT INTO pane_sessions (deck_id, pane_id, agent, session_id, cwd, command, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
   ON CONFLICT(deck_id, pane_id) DO UPDATE SET
     agent = excluded.agent,
     session_id = excluded.session_id,
     cwd = excluded.cwd,
     command = excluded.command,
     updated_at = excluded.updated_at`,
);

const stmtGet = db.prepare(
  "SELECT agent, session_id, cwd, command FROM pane_sessions WHERE deck_id = ? AND pane_id = ?",
);

const stmtDelete = db.prepare(
  "DELETE FROM pane_sessions WHERE deck_id = ? AND pane_id = ?",
);

const stmtDeleteDeck = db.prepare(
  "DELETE FROM pane_sessions WHERE deck_id = ?",
);

export type PaneSession = {
  agent: string;
  sessionId: string;
  cwd: string;
  command: string;
};

export function savePaneSession(deckId: string, paneId: string, agent: string, sessionId: string, cwd: string, command: string) {
  stmtUpsert.run(deckId, paneId, agent, sessionId, cwd, command);
}

export function getPaneSession(deckId: string, paneId: string): PaneSession | null {
  const row = stmtGet.get(deckId, paneId) as { agent: string; session_id: string; cwd: string; command: string } | undefined;
  if (!row) return null;
  return { agent: row.agent, sessionId: row.session_id, cwd: row.cwd, command: row.command };
}

export function deletePaneSession(deckId: string, paneId: string) {
  stmtDelete.run(deckId, paneId);
}

export function deleteDeckSessions(deckId: string) {
  stmtDeleteDeck.run(deckId);
}
