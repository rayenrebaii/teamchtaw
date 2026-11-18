"use client";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";
import { useCopy } from "@/lib/i18n";
import { Button } from "./button";
export function TablePagination({ page, total, onChange, disabled = false }: { page: number; total: number; onChange: (page: number) => void; disabled?: boolean }) {
  const { t } = useCopy();
  const pages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
  if (pages <= 1) return null;
  return <nav className="row wrap between request-pagination" aria-label={t("Pagination")}>
    <Button type="button" size="sm" variant="secondary" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>{t("Précédent")}</Button>
    <span className="small muted">{t("Page {page} sur {pages}", { page, pages })}</span>
    <Button type="button" size="sm" variant="secondary" disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}>{t("Suivant")}</Button>
  </nav>;
}
