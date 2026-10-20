const KEY = "stellarsettle:lastShipmentId";

export function loadLastShipmentId(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveLastShipmentId(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable; persistence is best-effort */
  }
}

export function clearLastShipmentId() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
