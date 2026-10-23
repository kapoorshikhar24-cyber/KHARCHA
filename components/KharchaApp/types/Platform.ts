export type PlatformMode = "web" | "desktop";

export type WebNavigationTab =
  | "overview"
  | "transactions"
  | "wallets"
  | "budgets"
  | "categories"
  | "recurring"
  | "reports"
  | "audit"
  | "settings";

export interface ElectronBridge {
  isElectron: boolean;
  platform: string;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (isMax: boolean) => void) => () => void;
  showNotification: (options: { title: string; body: string }) => void;
  getAppVersion: () => Promise<string>;
  toggleAutoLaunch: (enable: boolean) => Promise<boolean>;
  getAutoLaunchStatus: () => Promise<boolean>;
  onQuickAdd: (callback: () => void) => () => void;
  onNavigate: (callback: (screen: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridge;
  }
}
