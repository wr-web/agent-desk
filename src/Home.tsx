import { useState } from "react";
import type { Desk } from "./types";
import { FolderIcon, PlusIcon, SaveIcon, TerminalIcon, TrashIcon } from "./icons";

type Props = {
  desks: Desk[];
  busy: boolean;
  onCreate: (name: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

export function Home({ desks, busy, onCreate, onOpen, onDelete }: Props) {
  const [mode, setMode] = useState<"new" | "load" | "store" | null>(null);
  const [name, setName] = useState("");
  const latest = desks[0];
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onCreate(name.trim() || `Desk ${desks.length + 1}`);
  };

  return (
    <main className="home-shell">
      <div className="home-noise" />
      <header className="brand"><TerminalIcon size={22} /><span>AGENT DESK</span><small>LOCAL / {desks.length.toString().padStart(2, "0")}</small></header>
      <section className="home-hero">
        <p className="eyebrow">MULTI-AGENT WORKSPACE</p>
        <h1>One desk.<br /><em>Every agent.</em></h1>
        <p className="lede">Shape your terminal workspace once. Leave the processes running. Return without rebuilding your context.</p>
      </section>
      <section className="action-grid">
        <button className={`action-card coral ${mode === "new" ? "selected" : ""}`} onClick={() => setMode("new")}>
          <span className="action-number">01</span><PlusIcon size={32} /><strong>NEW</strong><p>Cut a fresh desk into terminal panes.</p><span className="action-arrow">↗</span>
        </button>
        <button className={`action-card dark ${mode === "load" ? "selected" : ""}`} onClick={() => setMode("load")}>
          <span className="action-number">02</span><FolderIcon size={32} /><strong>LOAD</strong><p>Bring back a stored workspace.</p><span className="action-arrow">↗</span>
        </button>
        <button className={`action-card sage ${mode === "store" ? "selected" : ""}`} onClick={() => setMode("store")}>
          <span className="action-number">03</span><SaveIcon size={32} /><strong>STORE</strong><p>Continue and update your last desk.</p><span className="action-arrow">↗</span>
        </button>
      </section>
      <section className={`home-drawer ${mode ? "open" : ""}`}>
        {mode === "new" && <form onSubmit={submit}><label htmlFor="desk-name">Name this desk</label><div className="new-row"><input id="desk-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Launch room" /><button disabled={busy}>Create desk <span>↵</span></button></div></form>}
        {mode === "load" && <DeskList desks={desks} onOpen={onOpen} onDelete={onDelete} empty="No stored desks yet." />}
        {mode === "store" && (latest ? <div className="continue-card"><div><small>LAST ACTIVE</small><strong>{latest.name}</strong><span>{Object.keys(latest.terminals).length} panes · {formatDate(latest.updatedAt)}</span></div><button onClick={() => onOpen(latest.id)}>Open to store <span>→</span></button></div> : <p className="empty-state">Create a desk before storing a workspace.</p>)}
      </section>
      <footer><span>PTYs stay alive while the server runs</span><span>⌘ LOCALHOST · PRIVATE</span></footer>
    </main>
  );
}

function DeskList({ desks, onOpen, onDelete, empty }: { desks: Desk[]; onOpen: (id: string) => void; onDelete: (id: string) => void; empty: string }) {
  if (!desks.length) return <p className="empty-state">{empty}</p>;
  return <div className="desk-list">{desks.map((desk) => <div className="desk-row" key={desk.id}><button className="desk-open" onClick={() => onOpen(desk.id)}><span className="desk-monogram">{desk.name.slice(0, 2).toUpperCase()}</span><span><strong>{desk.name}</strong><small>{Object.keys(desk.terminals).length} terminals · {formatDate(desk.updatedAt)}</small></span></button><button className="delete-button" aria-label={`Delete ${desk.name}`} onClick={() => onDelete(desk.id)}><TrashIcon size={17} /></button></div>)}</div>;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}
