"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "gcode.sidebar";
const CHANGE_EVENT = "gcode:sidebar";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const readOpen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "compact";
  } catch {
    return true;
  }
};

/** Sidebar full (true) or compact rail (false), remembered in localStorage. Server render and first paint are always full. */
export function useSidebarOpen(): [boolean, () => void] {
  const open = useSyncExternalStore(subscribe, readOpen, () => true);
  const toggle = () => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "compact" : "full");
    } catch {
      // storage unavailable — rail state just won't persist
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [open, toggle];
}
