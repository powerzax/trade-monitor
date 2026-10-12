"use client";

import { useEffect } from "react";

const MAX_TILT = 7; // degrees

// One document-level listener feeds the pointer position (as --mx / --my,
// relative to the element) to whichever .spotlight element is under the
// cursor; the glow itself is pure CSS in globals.css. Elements that are also
// .holo get a 3D tilt (--rx / --ry) toward the cursor. On touch devices the
// tilt follows the phone's orientation instead, where the browser allows it.
export function SpotlightTracker() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!window.matchMedia("(hover: hover)").matches) {
      if (reduced) return;
      const root = document.documentElement;
      const onOrientation = (e: DeviceOrientationEvent) => {
        if (e.beta === null || e.gamma === null) return;
        const ry = Math.max(-1, Math.min(1, e.gamma / 30)) * MAX_TILT;
        const rx = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * -MAX_TILT;
        root.style.setProperty("--device-rx", `${rx.toFixed(2)}deg`);
        root.style.setProperty("--device-ry", `${ry.toFixed(2)}deg`);
      };
      window.addEventListener("deviceorientation", onOrientation);
      return () => window.removeEventListener("deviceorientation", onOrientation);
    }

    let frame = 0;
    let pending: PointerEvent | null = null;
    let tilted: HTMLElement | null = null;

    const resetTilt = () => {
      if (!tilted) return;
      tilted.style.setProperty("--rx", "0deg");
      tilted.style.setProperty("--ry", "0deg");
      tilted = null;
    };

    const apply = () => {
      frame = 0;
      const e = pending;
      if (!e || !(e.target instanceof Element)) return;
      const el = e.target.closest<HTMLElement>(".spotlight");
      if (!el) return resetTilt();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);

      if (reduced || !el.classList.contains("holo")) return resetTilt();
      if (tilted !== el) resetTilt();
      tilted = el;
      const px = x / rect.width - 0.5;
      const py = y / rect.height - 0.5;
      el.style.setProperty("--rx", `${(-py * MAX_TILT * 2).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * MAX_TILT * 2).toFixed(2)}deg`);
      el.style.setProperty("--holo-pos", `${(px + 0.5) * 100}% ${(py + 0.5) * 100}%`);
    };

    const onMove = (e: PointerEvent) => {
      pending = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => resetTilt();

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
