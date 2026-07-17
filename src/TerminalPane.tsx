import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { TerminalInfo } from "./types";

type Props = {
  deskId: string;
  terminal: TerminalInfo;
  active: boolean;
  staged: boolean;
  onSelect: () => void;
};

export function TerminalPane({ deskId, terminal, active, staged, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<"connecting" | "online" | "offline">(staged ? "offline" : "connecting");

  useEffect(() => {
    if (staged || !hostRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0,
      lineHeight: 1.2,
      scrollback: 10_000,
      allowProposedApi: false,
      theme: {
        background: "#11110f",
        foreground: "#deddd5",
        cursor: "#ff6b3d",
        cursorAccent: "#11110f",
        selectionBackground: "#5d6255aa",
        black: "#1b1b18",
        red: "#e65b43",
        green: "#a8b875",
        yellow: "#d3a84d",
        blue: "#7296a8",
        magenta: "#a9859f",
        cyan: "#75aaa2",
        white: "#dddcd2",
        brightBlack: "#686860",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    const resizeTimers: number[] = [];
    let disposed = false;
    const sendSize = (jiggle = false) => {
      if (disposed || socket?.readyState !== WebSocket.OPEN) return;
      fit.fit();
      if (jiggle) {
        socket.send(JSON.stringify({ type: "resize", cols: Math.max(2, term.cols - 1), rows: term.rows }));
        resizeTimers.push(window.setTimeout(() => sendSize(), 100));
        return;
      }
      socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    const connect = () => {
      setStatus("connecting");
      socket = new WebSocket(`${protocol}://${location.host}/ws?desk=${encodeURIComponent(deskId)}&pane=${encodeURIComponent(terminal.id)}`);
      socket.addEventListener("open", () => {
        setStatus("online");
        sendSize();
        resizeTimers.push(window.setTimeout(() => sendSize(true), 250));
        resizeTimers.push(window.setTimeout(() => sendSize(true), 900));
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data as string) as { type: string; data?: string; exitCode?: number };
        if (message.type === "output" && message.data) term.write(message.data);
        if (message.type === "exit") term.write(`\r\n\x1b[38;2;255;107;61m[process exited ${message.exitCode}]\x1b[0m\r\n`);
      });
      socket.addEventListener("close", () => {
        if (disposed) return;
        setStatus("offline");
        reconnectTimer = window.setTimeout(connect, 800);
      });
    };
    connect();
    const input = term.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data }));
    });
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fit.fit();
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        } catch {
          // The pane may have been removed during the resize frame.
        }
      });
    });
    observer.observe(hostRef.current);
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      resizeTimers.forEach(clearTimeout);
      observer.disconnect();
      input.dispose();
      socket?.close();
      term.dispose();
      termRef.current = null;
    };
  }, [deskId, staged, terminal.id]);

  useEffect(() => {
    if (active) termRef.current?.focus();
  }, [active]);

  return (
    <section className={`terminal-pane ${active ? "is-active" : ""}`} onMouseDown={onSelect}>
      <header className="terminal-header">
        <span className={`status-dot ${status}`} />
        <strong>{terminal.title}</strong>
        <span className="terminal-path">{staged ? "New pane - press Enter" : terminal.cwd}</span>
      </header>
      {staged ? (
        <div className="staged-terminal"><span>↵</span><p>Commit layout to start this shell</p></div>
      ) : (
        <div className="terminal-host" ref={hostRef} />
      )}
    </section>
  );
}
