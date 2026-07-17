import { create } from 'zustand';

/** One action a screen contributes to the floating ⋯ menu. */
export interface MenuAction {
  id: string;
  label: string;
  run: () => void;
}

interface MenuState {
  /** Actions the current screen has registered (below the fixed "Settings" item). */
  actions: MenuAction[];
  /** Replace the registered actions (a screen sets its own on mount). */
  setActions: (a: MenuAction[]) => void;
  /** Clear all registered actions (a screen calls this on unmount). */
  clearActions: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  actions: [],
  setActions: (a) => set({ actions: a }),
  clearActions: () => set({ actions: [] }),
}));
