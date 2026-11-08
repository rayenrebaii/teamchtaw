"use client";
import { useEffect, useState } from "react";
import { api } from "@/services/api-client";
import { useCopy } from "@/lib/i18n";
import { useCommunity } from "@/stores/community";
export function PrivateImage({
  src,
  alt,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string }) {
  const { t } = useCopy();
  const owner = useCommunity((s) => s.session?.userId);
  const [image, setImage] = useState<{ source: string; owner?: string; url: string }>();
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    if (!src || !owner || !src.startsWith("/api/v1/uploads/")) return;
    let alive = true;
    let url: string | undefined;
    void api
      .blob(src.slice("/api/v1".length))
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (alive) setImage({ source: src, owner, url });
        else URL.revokeObjectURL(url);
      })
      .catch(() => {
        if (alive) setFailed(src);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, owner]);
  if (!src) return null;
  if (src.startsWith("blob:")) return <img src={src} alt={alt} {...props} />;
  if (image?.source === src && image.owner === owner)
    return <img src={image.url} alt={alt} {...props} />;
  return (
    <span
      className="image-loading"
      role="img"
      aria-label={failed === src ? t("Image indisponible") : alt}
    >
      {failed === src ? t("Image indisponible") : t("Chargement de l’image…")}
    </span>
  );
}
