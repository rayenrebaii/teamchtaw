"use client";
import { useCopy } from "@/lib/i18n";
export default function Loading() {
  const { t } = useCopy();
  return (
    <div className="boot" aria-label={t("Chargement…")}>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
