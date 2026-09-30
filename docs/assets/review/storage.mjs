import { validTimestamp } from "./validation.mjs";
const STORAGE_KEY = "garss-review-decisions-v1";

export function loadDecisions(storage) {
    try {
      const stored = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
      return Object.fromEntries(Object.entries(stored).filter(([id, decision]) =>
        /^[0-9a-f]{20}$/.test(id) && decision &&
        ["approved", "rejected"].includes(decision.status) && validTimestamp(decision.updated_at),
      ));
    } catch {
      return {};
    }
  }

export function saveDecisions(storage, decisions) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    return true;
  } catch {
    return false;
  }
}
