"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./auth-background.module.css";

const poster = "/images/auth-motion-poster.webp";

export function AuthBackground() {
  const video = useRef<HTMLVideoElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
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
      if (document.hidden) element.pause();
      else void element.play().catch(() => setFailed(true));
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [animated]);

  return <>
    <div className={styles.background} aria-hidden="true" data-auth-background>
      {/* This remains visible when playback is blocked or motion is reduced. */}
      <img className={styles.media} src={poster} alt="" width={768} height={1280} fetchPriority="high" />
      {animated && <video ref={video} className={styles.media} autoPlay muted loop playsInline
        preload="metadata" poster={poster} tabIndex={-1} onError={() => setFailed(true)} data-auth-video>
        <source src="/videos/auth-motion.mp4" type="video/mp4" onError={() => setFailed(true)} />
      </video>}
      <div className={styles.veil} />
      <div className={styles.halo} />
    </div>
  </>;
}
