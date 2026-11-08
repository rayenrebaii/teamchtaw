"use client";
import { useCopy } from "@/lib/i18n";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useCopy();
  return (
    <div className="boot">
      <h1>{t("Un contretemps dans la team.")}</h1>
      <p>{t("Rechargez cet écran pour reprendre la conversation.")}</p>
      <button className="btn btn-primary" onClick={reset}>
        {t("Réessayer")}
      </button>
    </div>
  );
}
