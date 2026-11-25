"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useCopy } from "@/lib/i18n";
import styles from "./auth-frame.module.css";

export function AuthLogo() {
  const { t } = useCopy();
  const video = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  return <div className={styles.logo}>
    {enabled && !failed ? <>
      <video ref={video} className={styles.logoVideo} autoPlay muted loop playsInline
        preload="metadata" poster="/branding/chtaw-logo.png" aria-label="Team Chtaw"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)}>
        <source src="/branding/chtaw-logo-animation.mp4" type="video/mp4" onError={() => setFailed(true)} />
      </video>
      <button type="button" className={styles.motionToggle}
        aria-label={playing ? t("Mettre le logo en pause") : t("Animer le logo")}
        onClick={() => { if (playing) video.current?.pause(); else void video.current?.play().catch(() => setPlaying(false)); }}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
    </> : <BrandLogo />}
  </div>;
}
