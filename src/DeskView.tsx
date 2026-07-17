import { useEffect, useMemo, useRef, useState } from "react";
import type { Desk, LayoutNode, TerminalInfo } from "./types";
import { api } from "./api";
import { CloseIcon, GridIcon, HomeIcon, MaximizeIcon, MinimizeIcon, SaveIcon, SettingsIcon, TerminalIcon, TrashIcon } from "./icons";
import { LayoutView } from "./LayoutView";

type Props = { initial: Desk; onHome: () => void; onStored: (desk: Desk) => void };

type KeyboardLockNavigator = Navigator & {
  keyboard?: {
    lock: (keys?: string[]) => Promise<void>;
    unlock: () => void;
  };
};

const paneIds = (node: LayoutNode): string[] => node.type === "pane" ? [node.id] : [...paneIds(node.first), ...paneIds(node.second)];

const updateNode = (node: LayoutNode, id: string, update: (node: LayoutNode) => LayoutNode): LayoutNode => {
  if (node.id === id) return update(node);
  if (node.type === "pane") return node;
  return { ...node, first: updateNode(node.first, id, update), second: updateNode(node.second, id, update) };
};

const removePane = (node: LayoutNode, id: string): LayoutNode | null => {
  if (node.type === "pane") return node.id === id ? null : node;
  const first = removePane(node.first, id);
  const second = removePane(node.second, id);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
};

export function DeskView({ initial, onHome, onStored }: Props) {
  const [persisted, setPersisted] = useState(initial);
  const [desk, setDesk] = useState(initial);
  const deskRef = useRef(initial);
  const savingRef = useRef(false);
  const [activePane, setActivePane] = useState(paneIds(initial.layout)[0]);
  const [editMode, setEditMode] = useState(false);
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");
  const [saving, setSaving] = useState(false);
  const [recreating, setRecreating] = useState(false);
  const [terminalGeneration, setTerminalGeneration] = useState(0);
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(false);
  const [opencodeSessions, setOpenCodeSessions] = useState<Array<{ id: string; title: string }>>([]);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const ids = useMemo(() => paneIds(desk.layout), [desk.layout]);
  const persistedIds = useMemo(() => new Set(paneIds(persisted.layout)), [persisted.layout]);
  const dirty = JSON.stringify({ n: desk.name, l: desk.layout, t: desk.terminals }) !== JSON.stringify({ n: persisted.name, l: persisted.layout, t: persisted.terminals });

  const updateDesk = (update: Desk | ((current: Desk) => Desk)) => {
    const next = typeof update === "function" ? update(deskRef.current) : update;
    deskRef.current = next;
    setDesk(next);
  };

  const store = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setEditMode(false);
    try {
      const current = deskRef.current;
      const saved = await api.save(current.id, current.name, current.layout, current.terminals);
      updateDesk(saved);
      setPersisted(saved);
      setNotice("Desk stored");
      onStored(saved);
      setTimeout(() => setNotice(""), 1800);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && editMode) {
        event.preventDefault();
        event.stopPropagation();
        void store();
      }
      if (event.key === "Escape" && editMode) {
        event.preventDefault();
        event.stopPropagation();
        updateDesk(persisted);
        setEditMode(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void store(); }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  });

  useEffect(() => {
    const change = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      if (!active) (navigator as KeyboardLockNavigator).keyboard?.unlock();
    };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    setOpenCodeSessions([]);
    api.opencodeSessions(desk.terminals[activePane].cwd)
      .then((sessions) => { if (!cancelled) setOpenCodeSessions(sessions); })
      .catch(() => { if (!cancelled) setOpenCodeSessions([]); });
    return () => { cancelled = true; };
  }, [activePane, desk.terminals, settings]);

  const toggleFullscreen = async () => {
    const keyboard = (navigator as KeyboardLockNavigator).keyboard;
    if (document.fullscreenElement) {
      keyboard?.unlock();
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
    if (!keyboard) {
      setNotice("This browser cannot reserve Esc in fullscreen");
      setTimeout(() => setNotice(""), 2400);
      return;
    }
    try {
      await keyboard.lock(["Escape"]);
    } catch {
      setNotice("This browser cannot reserve Esc in fullscreen");
      setTimeout(() => setNotice(""), 2400);
    }
  };

  const recreateTerminals = async () => {
    if (recreating) return;
    setRecreating(true);
    try {
      await api.recreate(desk.id);
      setTerminalGeneration((current) => current + 1);
      setNotice("Terminals recreated");
      setTimeout(() => setNotice(""), 1800);
    } finally {
      setRecreating(false);
    }
  };

  const split = (paneId: string, ratio: number) => {
    if (savingRef.current) return;
    const newId = crypto.randomUUID();
    updateDesk((current) => {
      const newTerminal: TerminalInfo = { id: newId, title: `Shell ${paneIds(current.layout).length + 1}`, cwd: current.terminals[paneId]?.cwd || "", command: "", resumeCommand: "" };
      return {
        ...current,
        layout: updateNode(current.layout, paneId, (node) => ({ type: "split", id: crypto.randomUUID(), direction: orientation, ratio, first: node, second: { type: "pane", id: newId } })),
        terminals: { ...current.terminals, [newId]: newTerminal },
      };
    });
    setActivePane(newId);
  };

  const closePane = (id: string) => {
    if (ids.length === 1) return;
    const layout = removePane(desk.layout, id);
    if (!layout) return;
    const terminals = { ...desk.terminals };
    delete terminals[id];
    updateDesk({ ...desk, layout, terminals });
    if (activePane === id) setActivePane(paneIds(layout)[0]);
  };

  const updateTerminal = (patch: Partial<TerminalInfo>) => updateDesk((current) => ({ ...current, terminals: { ...current.terminals, [activePane]: { ...current.terminals[activePane], ...patch } } }));

  return (
    <main className="desk-shell">
      <div className="desk-main">
        <header className="desk-topbar">
          <div className="desk-identity"><span className="live-mark" /><input value={desk.name} onChange={(event) => updateDesk({ ...desk, name: event.target.value })} aria-label="Desk name" /><small>{ids.length} PANES</small></div>
          <div className="desk-controls">
            {editMode && <div className="edit-instructions"><span>{orientation === "vertical" ? "Vertical cut" : "Horizontal cut"}</span><kbd>RIGHT CLICK</kbd> switch <kbd>ENTER</kbd> commit <kbd>ESC</kbd> cancel</div>}
            <button className={editMode ? "active" : ""} onClick={() => setEditMode(!editMode)}><GridIcon size={17} /> {editMode ? "Editing" : "Split"}</button>
            <button disabled={recreating} onClick={() => void recreateTerminals()} title="Destroy and recreate terminals"><TerminalIcon size={17} /> {recreating ? "Recreating" : "Recreate"}</button>
            <button onClick={() => void toggleFullscreen()} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? <MinimizeIcon size={17} /> : <MaximizeIcon size={17} />}<span className="fullscreen-label">{fullscreen ? "Exit" : "Full"}</span></button>
            <button className="store-button" disabled={saving} onClick={() => void store()}><SaveIcon size={17} /> {saving ? "Storing" : dirty ? "Store *" : "Store"}</button>
          </div>
        </header>
        <div className={`layout-canvas ${editMode ? "editing" : ""}`}>
          <LayoutView key={terminalGeneration} node={desk.layout} desk={desk} persistedIds={persistedIds} activePane={activePane} editMode={editMode} orientation={orientation} onSelect={setActivePane} onSplit={split} onToggleOrientation={() => setOrientation((value) => value === "vertical" ? "horizontal" : "vertical")} onRatio={(id, ratio) => updateDesk((current) => ({ ...current, layout: updateNode(current.layout, id, (node) => ({ ...node, ratio }) as LayoutNode) }))} />
        </div>
        {notice && <div className="toast"><span>●</span>{notice}</div>}
      </div>
      <nav className="desk-nav" aria-label="Desk navigation">
        <button className="nav-logo" onClick={onHome} title="Home"><TerminalIcon size={23} /></button>
        <div className="nav-rule" />
        <div className="pane-tabs">{ids.map((id, index) => <button key={id} className={activePane === id ? "active" : ""} onClick={() => setActivePane(id)} title={desk.terminals[id].title}><span className="tab-index">{String(index + 1).padStart(2, "0")}</span><span className="tab-screen"><i /><i /><i /></span><small>{desk.terminals[id].title.replace(/^Shell\s*/, "S")}</small></button>)}</div>
        <div className="nav-bottom">
          <button className={settings ? "active" : ""} onClick={() => setSettings(!settings)} title="Pane settings"><SettingsIcon /></button>
          <button onClick={onHome} title="Home"><HomeIcon /></button>
        </div>
      </nav>
      {settings && <aside className="settings-panel"><header><div><small>PANE SETTINGS</small><strong>{desk.terminals[activePane].title}</strong></div><button onClick={() => setSettings(false)}><CloseIcon /></button></header><label>Label<input value={desk.terminals[activePane].title} onChange={(event) => updateTerminal({ title: event.target.value })} /></label><label>Working directory<input value={desk.terminals[activePane].cwd} onChange={(event) => updateTerminal({ cwd: event.target.value })} /></label><label>OpenCode session<select value={desk.terminals[activePane].resumeCommand.match(/--session(?:=|\s+)["']?(ses_[A-Za-z0-9]+)/)?.[1] || ""} onChange={(event) => updateTerminal({ resumeCommand: event.target.value ? `opencode --session '${event.target.value}'` : "opencode" })}><option value="">Not pinned</option>{opencodeSessions.map((session) => <option key={session.id} value={session.id}>{session.title} ({session.id})</option>)}</select></label><label>Resume command<textarea rows={4} value={desk.terminals[activePane].resumeCommand} onChange={(event) => updateTerminal({ resumeCommand: event.target.value })} placeholder="Detected when you store" /></label><p>Pin an OpenCode session before Store to make Recreate restore that exact conversation.</p><button className="danger-action" disabled={ids.length === 1} onClick={() => { closePane(activePane); setSettings(false); }}><TrashIcon size={16} /> Remove pane</button></aside>}
    </main>
  );
}
