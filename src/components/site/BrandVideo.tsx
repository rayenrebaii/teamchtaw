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
      className="relative mb-10 aspect-video overflow-hidden rounded-3xl border bg-[#10071f] sm:aspect-[4/1]"
    >
      <img
        src="/images/chtaw-motion-wide-v1.webp"
        alt=""
        className="h-full w-full object-cover"
        width={1920}
        height={480}
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
          poster="/images/chtaw-motion-wide-v1.webp"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          data-brand-video
        >
          <source
            src="/videos/chtaw-motion-wide-v1.mp4"
            type="video/mp4"
            onError={() => setFailed(true)}
          />
        </video>
      )}
    </div>
  );
}
