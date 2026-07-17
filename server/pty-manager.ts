import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import * as pty from "node-pty";
import type WebSocket from "ws";
import type { TerminalSnapshot } from "./types.js";

const execFileAsync = promisify(execFile);

type Session = {
  pty: pty.IPty;
  clients: Set<WebSocket>;
  output: string;
  alternateScreen: boolean;
  privateModes: Set<number>;
  modeTail: string;
  initial: TerminalSnapshot;
  launchResume: () => void;
  cols: number;
  rows: number;
};

const sessions = new Map<string, Session>();
const keyFor = (deckId: string, paneId: string) => `${deckId}:${paneId}`;

function shellEscape(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function opencodeSessionId(command: string) {
  return command.match(/--session(?:=|\s+)["']?(ses_[A-Za-z0-9]+)/)?.[1] || "";
}

function resumeFor(command: string) {
  if (!command) return "";
  if (/(^|\/)opencode(?:\.exe)?(?:\s|$)/.test(command)) {
    const sessionId = opencodeSessionId(command);
    return sessionId ? `opencode --session ${shellEscape(sessionId)}` : "opencode";
  }
  if (/(^|\/)claude(?:\.exe)?(?:\s|$)/.test(command)) return "claude --continue";
  if (/(^|\/)codex(?:\.exe)?(?:\s|$)/.test(command)) return "codex resume --last";
  if (/^(?:\S*\/)?(?:ba|z|fi)?sh(?:\s|$)/.test(command)) return "";
  return command;
}

function isAgent(command: string) {
  return /(^|\/)(?:opencode|claude|codex|deepseek-tui|hermes)(?:\.exe)?(?:\s|$)/.test(command);
}

async function descendants(rootPid: number) {
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="]);
    const rows = stdout
      .split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }));
    const chain = [] as typeof rows;
    let parent = rootPid;
    while (true) {
      const child = rows.find((row) => row.ppid === parent);
      if (!child) break;
      chain.push(child);
      parent = child.pid;
    }
    return chain;
  } catch {
    return [];
  }
}

async function cwdFor(pid: number, fallback: string) {
  if (process.platform !== "darwin") return fallback;
  try {
    const { stdout } = await execFileAsync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
    return stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) || fallback;
  } catch {
    return fallback;
  }
}

export function ensureSession(deckId: string, pane: TerminalSnapshot) {
  const key = keyFor(deckId, pane.id);
  const existing = sessions.get(key);
  if (existing) return existing;

  const shell = process.env.SHELL || "/bin/zsh";
  const cwd = pane.cwd && existsSync(pane.cwd) ? pane.cwd : os.homedir();
  const savedResume = pane.resumeCommand === pane.command ? resumeFor(pane.command) : pane.resumeCommand;
  const resumeScript = `IFS= read -r AGENT_DESK_COMMAND; eval "$AGENT_DESK_COMMAND"; exec ${shellEscape(shell)} -l`;
  const terminal = pty.spawn(shell, savedResume ? ["-l", "-c", resumeScript] : ["-l"], {
    name: "xterm-256color",
    cols: 120,
    rows: 36,
    cwd,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
  });
  const session: Session = { pty: terminal, clients: new Set(), output: "", alternateScreen: false, privateModes: new Set(), modeTail: "", initial: pane, launchResume: () => {}, cols: 120, rows: 36 };
  let launchedResume = !savedResume;
  const launchResume = () => {
    if (launchedResume || session.clients.size === 0) return;
    launchedResume = true;
    terminal.write(`${savedResume}\r`);
  };
  session.launchResume = launchResume;
  terminal.onData((data) => {
    const probe = session.modeTail + data;
    for (const change of probe.matchAll(/\x1b\[\?([0-9;]+)([hl])/g)) {
      for (const value of change[1].split(";").map(Number)) {
        if (change[2] === "h") session.privateModes.add(value);
        else session.privateModes.delete(value);
      }
    }
    const changes = [...probe.matchAll(/\x1b\[\?(?:47|1047|1049)([hl])/g)];
    const latest = changes.at(-1);
    const wasAlternate = session.alternateScreen;
    if (latest) session.alternateScreen = latest[1] === "h";
    session.modeTail = probe.slice(-24);

    if (!wasAlternate && session.alternateScreen) {
      setTimeout(() => {
        if (!session.alternateScreen || sessions.get(key) !== session) return;
        terminal.resize(session.cols, Math.max(2, session.rows - 1));
        setTimeout(() => {
          if (sessions.get(key) !== session) return;
          terminal.resize(session.cols, session.rows);
          if (session.privateModes.has(1004)) terminal.write("\x1b[I");
        }, 80);
      }, 80);
    }

    if (session.alternateScreen) {
      if (!wasAlternate) session.output = "";
    } else if (wasAlternate && latest?.index !== undefined) {
      session.output = probe.slice(latest.index + latest[0].length);
    } else {
      session.output = (session.output + data).slice(-200_000);
    }
    for (const client of session.clients) {
      if (client.readyState === client.OPEN) client.send(JSON.stringify({ type: "output", data }));
    }
    launchResume();
  });
  terminal.onExit(({ exitCode }) => {
    if (sessions.get(key) !== session) return;
    for (const client of session.clients) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: "exit", exitCode }));
        client.close(1000, "Process exited");
      }
    }
    session.clients.clear();
    sessions.delete(key);
  });
  sessions.set(key, session);
  return session;
}

export function attachClient(deckId: string, pane: TerminalSnapshot, socket: WebSocket) {
  const session = ensureSession(deckId, pane);
  session.clients.add(socket);
  session.launchResume();
  if (session.alternateScreen) {
    const modes = [...session.privateModes].map((mode) => `\x1b[?${mode}h`).join("");
    if (modes) socket.send(JSON.stringify({ type: "output", data: modes }));
  } else if (session.output) {
    socket.send(JSON.stringify({ type: "output", data: session.output }));
  }
  let firstResize = true;
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as { type: string; data?: string; cols?: number; rows?: number };
      if (message.type === "input" && typeof message.data === "string") session.pty.write(message.data);
      if (message.type === "redraw") session.pty.write("\x0c");
      if (message.type === "resize" && message.cols && message.rows) {
        session.cols = message.cols;
        session.rows = message.rows;
        if (firstResize && session.alternateScreen) {
          session.pty.resize(message.cols, Math.max(2, message.rows - 1));
          setTimeout(() => session.pty.resize(message.cols!, message.rows!), 80);
        } else {
          session.pty.resize(message.cols, message.rows);
        }
        firstResize = false;
      }
    } catch {
      // Ignore malformed client frames without affecting the PTY.
    }
  });
  socket.on("close", () => session.clients.delete(socket));
}

export async function snapshotSession(deckId: string, pane: TerminalSnapshot): Promise<TerminalSnapshot> {
  const session = sessions.get(keyFor(deckId, pane.id));
  if (!session) return pane;
  const chain = await descendants(session.pty.pid);
  const foreground = chain.find((process) => isAgent(process.command)) || chain.at(-1);
  const cwd = await cwdFor(foreground?.pid || session.pty.pid, pane.cwd || os.homedir());
  const command = foreground?.command || "";
  const currentOpenCodeSession = opencodeSessionId(command);
  const savedOpenCodeSession = opencodeSessionId(pane.resumeCommand);
  const resumeCommand = isAgent(command) && /(^|\/)opencode(?:\.exe)?(?:\s|$)/.test(command) && (currentOpenCodeSession || savedOpenCodeSession)
    ? `opencode --session ${shellEscape(currentOpenCodeSession || savedOpenCodeSession)}`
    : resumeFor(command);
  return {
    ...pane,
    cwd,
    command,
    resumeCommand,
  };
}

export async function listOpenCodeSessions(cwd: string) {
  const directory = cwd.replaceAll("'", "''");
  const { stdout } = await execFileAsync("opencode", [
    "db",
    `SELECT id, title, time_updated AS timeUpdated FROM session WHERE directory = '${directory}' ORDER BY time_updated DESC LIMIT 50`,
    "--format",
    "json",
  ]);
  return JSON.parse(stdout) as Array<{ id: string; title: string; timeUpdated: number }>;
}

function closeSessionClients(session: Session) {
  for (const client of session.clients) {
    if (client.readyState === client.OPEN) client.close(1000, "Session ended");
  }
  session.clients.clear();
}

export function killSession(deckId: string, paneId: string) {
  const key = keyFor(deckId, paneId);
  const session = sessions.get(key);
  if (session) {
    closeSessionClients(session);
    session.pty.kill();
  }
  sessions.delete(key);
}

export function killDeck(deckId: string) {
  for (const [key, session] of sessions) {
    if (key.startsWith(`${deckId}:`)) {
      closeSessionClients(session);
      session.pty.kill();
      sessions.delete(key);
    }
  }
}
