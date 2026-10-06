"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { OfflineNotice, STATUS, StatusIcon } from "@/components/ui";
import { useTelemetry } from "@/lib/telemetry";
import { SLIDES } from "./slides";

const N = SLIDES.length;
const clamp = (k: number) => Math.max(0, Math.min(N - 1, k));

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Full-viewport slide deck over the site chrome. Keys: arrows, Space, PageUp/Down, Home/End, N notes, Esc exit. */
export function Deck() {
  const router = useRouter();
  const { status, frame } = useTelemetry();
  const live = status === "live";
  const [{ i, dir }, setPos] = useState({ i: 0, dir: 1 });
  const [notes, setNotes] = useState(false);
  const [full, setFull] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const go = (to: number) => setPos((p) => ({ i: clamp(to), dir: to >= p.i ? 1 : -1 }));
  const step = (d: number) => setPos((p) => ({ i: clamp(p.i + d), dir: d }));

  // deep link: #3 opens slide 3; the hash follows the deck
  useEffect(() => {
    const read = () => {
      const k = parseInt(location.hash.slice(1));
      if (k >= 1) go(k - 1);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const mounted = useRef(false);
  useEffect(() => {
    // the first run would overwrite the incoming #n before read() has applied it
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    history.replaceState(history.state, "", `#${i + 1}`);
  }, [i]);

  // put the live motor into the state the slide talks about (again once the backend comes back)
  useEffect(() => {
    if (live) SLIDES[i].enter?.();
  }, [i, live]);

  // the page under the deck must not scroll
  useEffect(() => {
    const el = document.documentElement, was = el.style.overflow;
    el.style.overflow = "hidden";
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => {
      el.style.overflow = was;
      document.removeEventListener("fullscreenchange", f);
    };
  }, []);

  useEffect(() => {
    // 1/2/3, [ ], D and F belong to <Controls/> on the demo slide: never bound here
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input:not([type=range]),textarea,select,[contenteditable]")) return;
      const k = e.key;
      if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " ") step(1);
      else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") step(-1);
      else if (k === "Home") go(0);
      else if (k === "End") go(N - 1);
      else if (k === "n" || k === "N") setNotes((v) => !v);
      else if (k === "Escape" && !document.fullscreenElement) router.push("/");
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const s = SLIDES[i];
  const Body = s.Body;
  return (
    <div role="region" aria-roledescription="presentation" aria-label="Project presentation"
      className="fixed inset-0 z-50 flex flex-col bg-page text-ink"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = e.target instanceof Element && e.target.closest("[data-noswipe],input") ? null : { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const a = touch.current, t = e.changedTouches[0];
        touch.current = null;
        if (!a) return;
        const dx = t.clientX - a.x, dy = t.clientY - a.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
      }}>
      <div className="h-1 shrink-0 bg-surface-2" role="progressbar" aria-label="Slide progress" aria-valuemin={1} aria-valuemax={N} aria-valuenow={i + 1}>
        <div className="h-full bg-series transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${((i + 1) / N) * 100}%` }} />
      </div>

      <header className="flex h-12 shrink-0 items-center gap-3 px-4 text-sm sm:px-8">
        <span className="min-w-0 truncate text-ink-2">
          <span className="tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
          <span className="ml-2">{s.title}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-ink-2" aria-live="polite">
          {live && frame ? (
            <><StatusIcon c={frame.label} className="size-4" /><span className="hidden sm:inline">AI reads</span> {STATUS[frame.label].label}</>
          ) : (
            <><span className="size-2 rounded-full bg-muted" />{status === "offline" ? "Backend offline" : "Connecting…"}</>
          )}
        </span>
      </header>

      <main key={i} className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${dir > 0 ? "deck-next" : "deck-prev"}`}>
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center gap-6 px-4 py-8 sm:px-8 sm:py-10">
          {s.live && <OfflineNotice />}
          <Body />
        </div>
      </main>

      {notes && (
        <aside aria-label="Speaker notes" className="max-h-[32vh] shrink-0 overflow-y-auto border-t border-line bg-surface px-4 py-4 sm:px-8">
          <p className="text-xs font-medium text-muted">Speaker notes · slide {i + 1}</p>
          <p className="mt-1.5 max-w-4xl text-base leading-relaxed text-ink-2 sm:text-lg">{s.notes}</p>
        </aside>
      )}

      <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-line px-4 sm:px-8">
        <Btn label="Previous slide" onClick={() => step(-1)} disabled={i === 0}><path d="M15 6l-6 6 6 6" /></Btn>
        <span className="min-w-14 text-center text-sm tabular-nums text-ink-2">{i + 1} / {N}</span>
        <Btn label="Next slide" onClick={() => step(1)} disabled={i === N - 1}><path d="M9 6l6 6-6 6" /></Btn>
        <span className="ml-auto" />
        <button onClick={() => setNotes((v) => !v)} aria-pressed={notes}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink aria-pressed:bg-surface-2 aria-pressed:text-ink focus-visible:outline-2 focus-visible:outline-series">
          Notes <kbd className="kbd hidden sm:inline-grid">N</kbd>
        </button>
        <Btn label={full ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
          {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
        </Btn>
        <Link href="/" className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-series">
          Exit <kbd className="kbd hidden sm:inline-grid">Esc</kbd>
        </Link>
      </footer>

      <style>{`
        @keyframes deck-next { from { opacity: 0; transform: translateX(28px); } }
        @keyframes deck-prev { from { opacity: 0; transform: translateX(-28px); } }
        .deck-next { animation: deck-next .45s cubic-bezier(.2,.8,.2,1); }
        .deck-prev { animation: deck-prev .45s cubic-bezier(.2,.8,.2,1); }
        @media (prefers-reduced-motion: reduce) { .deck-next, .deck-prev { animation: none; } }
      `}</style>
    </div>
  );
}

function Btn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="grid size-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-series">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
