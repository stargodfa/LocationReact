// src/utils/uiPersist.ts
export type UiPersistState = {
  activeView: string;
  viewState: {
    maps?: {
      mapId?: string;
    };
    location?: {
      mapId?: string;
    };
  };
};

const KEY = "ble-ui-persist";

export function loadUiState(): UiPersistState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return { activeView: "maps", viewState: {} };
    }
    return JSON.parse(raw);
  } catch {
    return { activeView: "maps", viewState: {} };
  }
}

export function saveUiState(state: UiPersistState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}
