"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import styles from "./installation.module.css";

export function InstallationVideo() {
  const { t } = useCopy();
  const ref = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setAllowed(!media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const animated = allowed && !failed;
  useEffect(() => {
    const element = ref.current;
    if (!element || !animated) return;
    const update = () => {
      if (paused || document.hidden) element.pause();
      else void element.play().catch(() => setFailed(true));
    };
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [animated, paused]);
  return <>
    <div className={styles.backdrop} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/auth-motion-poster.webp" alt="" className={styles.video} width={768} height={1280} fetchPriority="high" />
      {animated && <video ref={ref} className={styles.video} autoPlay muted loop playsInline preload="metadata"
        poster="/images/auth-motion-poster.webp" tabIndex={-1} onError={() => setFailed(true)}>
        <source src="/videos/auth-motion.mp4" type="video/mp4" onError={() => setFailed(true)} />
      </video>}
      <div className={styles.veil} />
    </div>
    {animated && <button type="button" className={styles.videoToggle} aria-label={paused ? t("Animer le fond") : t("Mettre le fond en pause")} onClick={() => setPaused(value => !value)}>
      {paused ? <Play size={15} /> : <Pause size={15} />}
    </button>}
  </>;
}
