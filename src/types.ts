export type LayoutNode =
  | { type: "pane"; id: string }
  | {
      type: "split";
      id: string;
      direction: "horizontal" | "vertical";
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

export type TerminalInfo = {
  id: string;
  title: string;
  cwd: string;
  command: string;
  resumeCommand: string;
};

export type Desk = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layout: LayoutNode;
  terminals: Record<string, TerminalInfo>;
};
