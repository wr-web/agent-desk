type IconProps = { size?: number; className?: string };

const Icon = ({ children, size = 20, className }: IconProps & { children: React.ReactNode }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const PlusIcon = (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>;
export const FolderIcon = (props: IconProps) => <Icon {...props}><path d="M3 7.5h7l2-2h9v13H3z" /></Icon>;
export const SaveIcon = (props: IconProps) => <Icon {...props}><path d="M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-7h8v7" /></Icon>;
export const GridIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M3 12h18" /></Icon>;
export const HomeIcon = (props: IconProps) => <Icon {...props}><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3z" /></Icon>;
export const TrashIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h16M9 3h6l1 4H8l1-4zM6 7l1 14h10l1-14M10 11v6M14 11v6" /></Icon>;
export const TerminalIcon = (props: IconProps) => <Icon {...props}><path d="m5 7 4 4-4 4M11 16h7" /><rect x="2" y="3" width="20" height="18" rx="2" /></Icon>;
export const SettingsIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" /></Icon>;
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
export const MaximizeIcon = (props: IconProps) => <Icon {...props}><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></Icon>;
export const MinimizeIcon = (props: IconProps) => <Icon {...props}><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" /></Icon>;
