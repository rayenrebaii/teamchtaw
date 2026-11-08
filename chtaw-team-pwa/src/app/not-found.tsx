"use client";
import { useCopy } from "@/lib/i18n";
import Link from "next/link";
export default function NotFound() {
  const { t } = useCopy();
  return (
    <div className="boot">
      <h1>{t("Cette page a quitté le terrain.")}</h1>
      <Link href="/app">{t("Revenir aux conversations ↗")}</Link>
    </div>
  );
}
