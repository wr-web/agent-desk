import { useRef } from "react";
import type { Desk, LayoutNode } from "./types";
import { TerminalPane } from "./TerminalPane";

type Props = {
  node: LayoutNode;
  desk: Desk;
  persistedIds: Set<string>;
  activePane: string;
  editMode: boolean;
  orientation: "horizontal" | "vertical";
  onSelect: (id: string) => void;
  onSplit: (id: string, ratio: number) => void;
  onRatio: (id: string, ratio: number) => void;
  onToggleOrientation: () => void;
};

export function LayoutView(props: Props) {
  const { node } = props;
  if (node.type === "pane") return <PaneNode {...props} id={node.id} />;
  return <SplitNode {...props} node={node} />;
}

function PaneNode({ id, desk, persistedIds, activePane, editMode, orientation, onSelect, onSplit, onToggleOrientation }: Props & { id: string }) {
  const paneRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const terminal = desk.terminals[id];

  const movePreview = (event: React.MouseEvent) => {
    if (!editMode || !paneRef.current || !lineRef.current) return;
    const rect = paneRef.current.getBoundingClientRect();
    const ratio = orientation === "vertical" ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height;
    lineRef.current.style.setProperty("--cut", `${Math.max(15, Math.min(85, ratio * 100))}%`);
  };

  const split = (event: React.MouseEvent) => {
    if (!editMode || !paneRef.current) return;
    const rect = paneRef.current.getBoundingClientRect();
    const raw = orientation === "vertical" ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height;
    onSplit(id, Math.max(0.15, Math.min(0.85, raw)));
  };

  return (
    <div className="pane-node" ref={paneRef} onMouseMove={movePreview}>
      <TerminalPane deskId={desk.id} terminal={terminal} active={activePane === id} staged={!persistedIds.has(id)} onSelect={() => onSelect(id)} />
      {editMode && (
        <div className={`cut-surface ${orientation}`} onClick={split} onContextMenu={(event) => { event.preventDefault(); onToggleOrientation(); }}>
          <div className="cut-line" ref={lineRef}><span>{orientation === "vertical" ? "VERTICAL" : "HORIZONTAL"}</span></div>
        </div>
      )}
    </div>
  );
}

function SplitNode(props: Props & { node: Extract<LayoutNode, { type: "split" }> }) {
  const { node, onRatio } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const beginResize = (event: React.PointerEvent) => {
    if (props.editMode) return;
    event.preventDefault();
    const root = containerRef.current?.closest(".layout-canvas");
    const intersections = root
      ? [...root.querySelectorAll<HTMLElement>(".split-node")]
          .filter((element) => element.dataset.splitId !== node.id && element.dataset.direction !== node.direction)
          .filter((element) => {
            const divider = element.querySelector<HTMLElement>(":scope > .split-divider");
            if (!divider) return false;
            const rect = divider.getBoundingClientRect();
            return event.clientX >= rect.left - 8 && event.clientX <= rect.right + 8 && event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8;
          })
      : [];
    const targets = [containerRef.current, ...intersections].filter((element): element is HTMLElement => Boolean(element));
    if (targets.length > 1) document.body.style.cursor = "move";
    const move = (next: PointerEvent) => {
      for (const target of targets) {
        const rect = target.getBoundingClientRect();
        const direction = target.dataset.direction;
        const raw = direction === "vertical" ? (next.clientX - rect.left) / rect.width : (next.clientY - rect.top) / rect.height;
        onRatio(target.dataset.splitId!, Math.max(0.12, Math.min(0.88, raw)));
      }
    };
    const up = () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className={`split-node ${node.direction}`} ref={containerRef} data-split-id={node.id} data-direction={node.direction}>
      <div className="split-child" style={{ flexBasis: `${node.ratio * 100}%` }}><LayoutView {...props} node={node.first} /></div>
      <button className="split-divider" onPointerDown={beginResize} aria-label="Resize panes" />
      <div className="split-child" style={{ flexBasis: `${(1 - node.ratio) * 100}%` }}><LayoutView {...props} node={node.second} /></div>
    </div>
  );
}
