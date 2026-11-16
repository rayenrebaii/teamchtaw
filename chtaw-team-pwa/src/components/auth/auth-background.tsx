import Image from "next/image";
import type { CSSProperties } from "react";
import styles from "./auth-background.module.css";

// Stable positions avoid hydration differences and any work on each animation frame.
const particles = [
  [8, 18, 0, 17], [19, 73, -5, 23], [31, 34, -9, 19], [44, 86, -3, 26],
  [55, 12, -12, 21], [66, 64, -7, 25], [79, 26, -2, 18], [92, 79, -11, 24],
];

export function AuthBackground() {
  return (
    <div className={styles.background} aria-hidden="true" data-auth-background>
      <div className={styles.halo} />
      <div className={styles.gymnast}>
        <Image src="/images/auth-gymnast.webp" alt="" width={1400} height={700}
          sizes="(max-width: 800px) 135vw, 82vw" loading="eager" />
      </div>
      <div className={`${styles.ringPlane} ${styles.first}`}><span className={styles.ring} /></div>
      <div className={`${styles.ringPlane} ${styles.second}`}><span className={styles.ring} /></div>
      <div className={`${styles.ringPlane} ${styles.third}`}><span className={styles.ring} /></div>
      {particles.map(([x, y, delay, duration], index) => (
        <span key={index} className={styles.particle} data-mobile-hidden={index >= 4 ? "" : undefined} style={{
          left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s`,
        } as CSSProperties} />
      ))}
      <div className={styles.veil} />
    </div>
  );
}
