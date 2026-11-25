"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import styles from "./auth-background.module.css";

const poster = "/images/auth-motion-poster.webp";

export function AuthBackground() {
  const { t } = useCopy();
  const video = useRef<HTMLVideoElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const animated = motionAllowed && !failed;
  useEffect(() => {
    const element = video.current;
    if (!element || !animated) return;
    const update = () => {
      if (paused || document.hidden) element.pause();
      else void element.play().catch(() => setFailed(true));
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [animated, paused]);

  return <>
    <div className={styles.background} aria-hidden="true" data-auth-background data-paused={paused || undefined}>
      {/* This remains visible when playback is blocked or motion is reduced. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.media} src={poster} alt="" width={768} height={1280} fetchPriority="high" />
      {animated && <video ref={video} className={styles.media} autoPlay muted loop playsInline
        preload="metadata" poster={poster} tabIndex={-1} onError={() => setFailed(true)} data-auth-video>
        <source src="/videos/auth-motion.mp4" type="video/mp4" onError={() => setFailed(true)} />
      </video>}
      <div className={styles.veil} />
      <div className={styles.halo} />
    </div>
    {animated && <button type="button" className={styles.motionToggle}
      aria-label={paused ? t("Animer le fond") : t("Mettre le fond en pause")}
      onClick={() => setPaused(value => !value)}>
      {paused ? <Play size={14} /> : <Pause size={14} />}
    </button>}
  </>;
}
