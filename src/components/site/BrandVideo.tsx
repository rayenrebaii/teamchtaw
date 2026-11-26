import { useEffect, useRef, useState } from "react";

export function BrandVideo() {
  const [reduced, setReduced] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element || reduced || failed) return;
    const update = () => {
      if (document.hidden) element.pause();
      else void element.play().catch(() => setFailed(true));
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [reduced, failed]);
  return (
    <div
      aria-hidden="true"
      className="relative mb-10 h-64 overflow-hidden rounded-3xl border bg-[#10071f] sm:h-80"
    >
      <img
        src="/images/chtaw-motion-poster.webp"
        alt=""
        className="h-full w-full object-contain"
        width={768}
        height={1280}
      />
      {!reduced && !failed && (
        <video
          ref={video}
          autoPlay
          muted
          loop
          playsInline
          controls={false}
          tabIndex={-1}
          preload="metadata"
          poster="/images/chtaw-motion-poster.webp"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain"
          data-brand-video
        >
          <source src="/videos/chtaw-motion.mp4" type="video/mp4" onError={() => setFailed(true)} />
        </video>
      )}
    </div>
  );
}
