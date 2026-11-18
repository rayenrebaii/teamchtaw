"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { AttendanceCounts, RegistrationBucket } from "@/services/analytics.service";
import styles from "./analytics-dashboard.module.css";

export const dashboardDate = (day: string, locale: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
export function AnalyticsPagination({ page, total, limit, change, busy = false }: { page: number; total: number; limit: number; change: (page: number) => void; busy?: boolean }) {
  const { t } = useCopy();
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return <nav className={styles.pagination} aria-label={t("Pagination")}>
    <Button variant="ghost" size="sm" disabled={busy || page <= 1} onClick={() => change(page - 1)}><ChevronLeft size={16} aria-hidden="true" />{t("Précédent")}</Button>
    <span>{t("Page {page} sur {pages}", { page, pages })}</span>
    <Button variant="ghost" size="sm" disabled={busy || page >= pages} onClick={() => change(page + 1)}>{t("Suivant")}<ChevronRight size={16} aria-hidden="true" /></Button>
  </nav>;
}

export function RegistrationChart({ buckets, cumulative }: { buckets: RegistrationBucket[]; cumulative: boolean }) {
  const { t, locale } = useCopy();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => { if (entries[0]) setWidth(Math.max(240, Math.round(entries[0].contentRect.width))); });
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  const height = width < 500 ? 200 : 240, left = 36, right = 16, top = 20, bottom = 36;
  const values = buckets.map(bucket => cumulative ? bucket.cumulative : bucket.count);
  const max = Math.max(2, Math.ceil(Math.max(0, ...values) / 2) * 2);
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, buckets.length - 1);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join(" ");
  const index = active === null ? Math.max(0, buckets.length - 1) : Math.min(active, buckets.length - 1);
  const bucket = buckets[index];
  const tickIndexes = [...new Set(width < 450 ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1] : [0, Math.floor((buckets.length - 1) / 3), Math.floor(2 * (buckets.length - 1) / 3), buckets.length - 1])].filter(value => value >= 0 && value < buckets.length);
  return <div ref={container} className={styles.lineChart}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={t("Courbe des inscriptions : utilisez les flèches pour parcourir les valeurs.")} aria-describedby={`${id}-value`}
      onPointerMove={event => { const box = event.currentTarget.getBoundingClientRect(); setActive(Math.max(0, Math.min(buckets.length - 1, Math.round(((event.clientX - box.left) * width / box.width - left) / (width - left - right) * (buckets.length - 1))))); }}
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); setActive(event.key === "Home" ? 0 : event.key === "End" ? buckets.length - 1 : Math.max(0, Math.min(buckets.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))); } }}>
      <title>{t(cumulative ? "Total cumulé des comptes conservés" : "Nouvelles inscriptions")}</title>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".22" /><stop offset="100%" stopColor="var(--primary)" stopOpacity=".01" /></linearGradient></defs>
      {[0, max / 2, max].map((value, i) => <g key={i}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className={styles.gridLine} /><text x={left - 10} y={y(value) + 4} textAnchor="end">{Number.isInteger(value) ? value : value.toFixed(1)}</text></g>)}
      {values.length > 0 && <><path d={`${line} L${x(values.length - 1)},${y(0)} L${left},${y(0)} Z`} fill={`url(#${id})`} /><path d={line} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" />
        <line x1={x(index)} x2={x(index)} y1={top} y2={height - bottom} stroke="var(--primary)" strokeDasharray="4 4" opacity=".5" />
        <circle cx={x(index)} cy={y(values[index] ?? 0)} r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      </>}
      {tickIndexes.map(i => <text key={i} x={x(i)} y={height - 10} textAnchor={i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"}>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${buckets[i]!.from}T12:00:00Z`))}</text>)}
    </svg>
    {bucket && <div id={`${id}-value`} className={styles.chartReadout} aria-live="polite"><span>{dashboardDate(bucket.from, locale)}{bucket.to !== bucket.from ? ` – ${dashboardDate(bucket.to, locale)}` : ""}</span><strong>{values[index]?.toLocaleString(locale)} {t(cumulative ? "comptes cumulés" : "inscription(s)")}</strong></div>}
    {!values.some(Boolean) && <p className={styles.empty}>{t("Aucune inscription sur cette période.")}</p>}
  </div>;
}

export function AttendanceLegend() {
  const { t } = useCopy();
  return <div className={styles.legend}><span><i className={styles.presentDot} />{t("Présences")}</span><span><i className={styles.absentDot} />{t("Absences confirmées")}</span></div>;
}

export function ComparisonRow({ name, subtitle, counts, max, members, href, onClick }: { name: string; subtitle?: string; counts: AttendanceCounts; max: number; members?: number; href?: string; onClick?: () => void }) {
  const { t, locale } = useCopy();
  const id = useId();
  const content = <>
    <span className={styles.barHeading}><strong>{name}</strong>{subtitle && <small>{subtitle}</small>}</span>
    <span className={styles.barPair}>
      <span className={styles.barTrack}><span className={styles.presentBar} style={{ width: `${100 * counts.present / Math.max(1, max)}%` }} /><span className={styles.barValue}>{t("Présences")} · {counts.present}</span></span>
      <span className={styles.barTrack}><span className={styles.absentBar} style={{ width: `${100 * counts.absent / Math.max(1, max)}%` }} /><span className={styles.barValue}>{t("Absences")} · {counts.absent}</span></span>
    </span>
    <span id={id} role="tooltip" className={styles.barTooltip}>
      {t("Taux de présence")} : {counts.rate === null ? "—" : `${counts.rate.toLocaleString(locale)} %`}
      {members !== undefined && <> · {t("Étudiants actuels")} : {members}</>}
      <> · {t("Participations établies")} : {counts.present + counts.absent} · {t("Pointages incomplets")} : {counts.pending}</>
    </span>
  </>;
  return href ? <Link href={href} className={styles.barRow} aria-describedby={id}>{content}</Link> : <button type="button" className={styles.barRow} onClick={onClick} aria-describedby={id}>{content}</button>;
}
