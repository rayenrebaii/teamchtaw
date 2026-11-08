"use client";
import { useEffect } from "react";

const message =
  "Des modifications de présence ne sont pas enregistrées. Voulez-vous quitter cette page et les abandonner ?";

export function useUnsavedAttendance(blocked: boolean, locationKey: string) {
  useEffect(() => {
    if (!blocked) return;
    const currentUrl = window.location.href;
    const currentState: unknown = window.history.state;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const element = event.target instanceof Element ? event.target : null;
      const link = element?.closest<HTMLAnchorElement>("a[href]");
      const logout = element?.closest("button[data-confirm-navigation]");
      if (!link && !logout) return;
      if (link) {
        if (link.target === "_blank" || link.hasAttribute("download")) return;
        const target = new URL(link.href, currentUrl);
        const current = new URL(currentUrl);
        if (
          target.pathname === current.pathname &&
          target.search === current.search &&
          target.origin === current.origin
        )
          return;
      }
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const popState = (event: PopStateEvent) => {
      if (window.confirm(message)) return;
      // Run before Next's popstate listener: keep the mounted page and its drafts.
      event.stopImmediatePropagation();
      window.history.pushState(currentState, "", currentUrl);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", popState, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", popState, true);
    };
  }, [blocked, locationKey]);
}
