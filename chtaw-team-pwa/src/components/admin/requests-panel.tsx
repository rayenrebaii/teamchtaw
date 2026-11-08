"use client";
import { useCopy, currentLanguage } from "@/lib/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search, SlidersHorizontal, ChevronDown, ChevronRight, RotateCcw, CalendarDays, Users, Eye, Check, X, UserPlus, History, Ban } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { Avatar, Empty, StatusBadge, attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import {
  defaultRequestFilters,
  filterRequests,
  isValidRequestPeriod,
  type RequestFilters,
} from "@/features/requests";
import type { User } from "@/types";
import { usersService, type AdmissionDecision } from "@/services/users.service";
import { useRemote, LoadState } from "./attendance-panel";
import styles from "./members-panel.module.css";

function Assignment({ user, close }: { user: User; close: () => void }) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const memberships = store.groups.filter((g) => g.memberIds.includes(user.id));
  const selected = store.groups.find((g) => g.id === target);
  const alreadyAssigned = !!selected?.memberIds.includes(user.id);
  const eligible = user.status === "APPROVED";
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={`Affecter ${user.firstName} à un groupe`}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !eligible || !selected || selected.isGeneral || (alreadyAssigned && !source))
            return;
          setBusy(true);
          const saved = await attempt(
            () =>
              source
                ? store.move(user.id, source, target)
                : store.membership(target, user.id, true),
            source ? copy("Groupe changé avec succès") : copy("Affectation enregistrée"),
          );
          setBusy(false);
          if (saved) close();
        }}
      >
        <p>
          {" "}
          {copy("Groupes actuels :")}{" "}
          {memberships.map((g) => g.name).join(", ") || copy("Aucun groupe")}
        </p>
        <p className="muted">
          {copy(
            "Le groupe général est automatique. Un membre peut rejoindre plusieurs groupes privés.",
          )}{" "}
        </p>
        {!eligible && (
          <p role="status">
            {copy("Acceptez d’abord la demande pour pouvoir affecter ce membre à un groupe.")}{" "}
          </p>
        )}
        <label>
          {copy("Rechercher un groupe")}{" "}
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <fieldset className="request-group-options" disabled={busy || !eligible}>
          <legend> {copy("Choisir le groupe de destination")} </legend>
          {store.groups
            .filter((g) =>
              g.name.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")),
            )
            .map((g) => (
              <label className="membership-row" key={g.id}>
                <span>
                  {g.name}
                  {g.isGeneral
                    ? " · Automatique"
                    : g.memberIds.includes(user.id)
                      ? " · Déjà affecté"
                      : ""}
                </span>
                <input
                  type="radio"
                  name="request-group"
                  value={g.id}
                  checked={target === g.id}
                  disabled={g.isGeneral}
                  onChange={() => {
                    setTarget(g.id);
                    if (source === g.id) setSource("");
                  }}
                />
              </label>
            ))}
          {!store.groups.some((g) =>
            g.name.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")),
          ) && <p> {copy("Aucun groupe trouvé.")} </p>}
        </fieldset>
        {eligible && user.role !== "ADMIN" && (
          <label>
            {copy("Changer de groupe (facultatif)")}{" "}
            <select value={source} disabled={busy} onChange={(e) => setSource(e.target.value)}>
              <option value=""> {copy("Conserver les groupes actuels")} </option>
              {memberships
                .filter((g) => !g.isGeneral && g.id !== target)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {copy("Remplacer")} {g.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {selected && (
          <p role="status">
            {copy("Destination :")} {selected.name}
            {alreadyAssigned ? " (déjà affecté)" : ""}.
            {source && " L’appartenance au groupe source sera retirée."}
          </p>
        )}
        <div className="row wrap">
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>
            {copy("Annuler")}{" "}
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              !eligible ||
              !selected ||
              selected.isGeneral ||
              source === target ||
              (alreadyAssigned && !source)
            }
          >
            {busy ? copy("Enregistrement…") : copy("Confirmer l’affectation")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MembersPanel({
  initialStatus = "ALL",
}: {
  initialStatus?: RequestFilters["status"];
}) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const id = useId();
  const [filters, setFilters] = useState<RequestFilters>({
    ...defaultRequestFilters,
    status: initialStatus,
  });
  const [decision, setDecision] = useState<{ user: User; status: "APPROVED" | "REJECTED" } | null>(
    null,
  );
  const [groupsId, setGroupsId] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [period, setPeriod] = useState({ start: "", end: "" });
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<User | null>(null);
  const isAdmin = store.users.some((user) => user.id === store.session?.userId && user.role === "ADMIN");
  const tabsRef = useRef<HTMLDivElement>(null);
  const [moreTabs, setMoreTabs] = useState(false);
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const measure = () => setMoreTabs(tabs.scrollWidth - tabs.clientWidth - tabs.scrollLeft > 2);
    const observer = new ResizeObserver(measure);
    observer.observe(tabs);
    for (const tab of tabs.children) observer.observe(tab);
    tabs.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      tabs.removeEventListener("scroll", measure);
    };
  }, [store.users.length]);
  const update = (patch: Partial<RequestFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const invalidRange = !isValidRequestPeriod(period.start, period.end);
  const results = filterRequests(store.users, filters, store.groups);
  const reset = () => {
    update({ ...defaultRequestFilters, status: "ALL" });
    setPeriod({ start: "", end: "" });
    setAdvanced(false);
  };
  const tabs = [
    { value: "ALL", label: "Tous les membres" },
    { value: "PENDING", label: "En attente" },
    { value: "APPROVED", label: "Acceptées" },
    { value: "REJECTED", label: "Refusées" },
  ] as const;
  const periodApplied = !!(filters.start || filters.end);
  const periodChanged = period.start !== filters.start || period.end !== filters.end;
  const pages = Math.max(1, Math.ceil(results.length / 10));
  const currentPage = Math.min(page, pages);
  const detail = store.users.find((u) => u.id === detailId);
  const assignment = store.users.find((u) => u.id === assignmentId);
  const groupsFor = (id: string) =>
    store.groups
      .filter((g) => g.memberIds.includes(id))
      .map((g) => g.name)
      .join(", ") || copy("Aucun groupe");
  const review = async (user: User, status: "APPROVED" | "REJECTED") => {
    if (busy) return;
    setBusy(user.id);
    const saved = await attempt(
      () => store.review(user.id, status),
      status === "APPROVED"
        ? copy("Demande acceptée · Ajout au groupe général")
        : copy("Demande refusée"),
    );
    setBusy(null);
    if (saved) {
      setDecision(null);
      if (status === "APPROVED") setAssignmentId(user.id);
    }
  };
  return (
    <>
      <header className="page-heading requests-heading">
        <div>
          <span className="eyebrow"> {copy("ESPACE ADMIN · ADHÉSIONS")} </span>
          <h1 id={`${id}-heading`}> {copy("Gestion des membres")} </h1>
          <p className="muted">
            {copy("Gérez les membres, les demandes d’adhésion et leurs groupes.")}{" "}
          </p>
        </div>
      </header>
      <div className="stats-grid members-stats" aria-label={copy("Statistiques des comptes")}>
        {[
          { label: "Total des membres", value: store.users.length },
          {
            label: "Demandes en attente",
            value: store.users.filter((user) => user.status === "PENDING").length,
          },
          {
            label: "Membres approuvés",
            value: store.users.filter((user) => user.status === "APPROVED").length,
          },
          {
            label: "Demandes refusées",
            value: store.users.filter((user) => user.status === "REJECTED").length,
          },
        ].map((stat) => (
          <div className="stat-card" key={copy(stat.label)}>
            <span>{copy(stat.label)}</span>
            <strong>{store.loading && !store.users.length ? "…" : stat.value}</strong>
          </div>
        ))}
      </div>
      <p className="tiny muted">
        {" "}
        {copy(
          "Un compte représente une inscription : les statuts ci-dessus comptent les comptes, pas les affectations aux groupes.",
        )}{" "}
      </p>
      <section className={`panel requests-panel ${styles.panel}`} aria-labelledby={`${id}-heading`}>
        <div className={styles.tabsShell}>
        <div ref={tabsRef} className="request-status-tabs" role="tablist" aria-label="Statut des membres">
          {tabs.map((tab, index) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${id}-${tab.value}`}
              aria-selected={filters.status === tab.value}
              aria-controls={`${id}-results`}
              tabIndex={filters.status === tab.value ? 0 : -1}
              onClick={() => update({ status: tab.value })}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                update({ status: tabs[next].value });
                document.getElementById(`${id}-${tabs[next].value}`)?.focus();
              }}
            >
              {copy(tab.label)}
              <span>
                {tab.value === "ALL"
                  ? store.users.length
                  : store.users.filter((u) => u.status === tab.value).length}
              </span>
            </button>
          ))}
        </div>
        {moreTabs && <span className={styles.tabsHint} aria-hidden="true"><ChevronRight size={16} /></span>}
        </div>
        <div className="request-primary-filters">
          <label className="request-search">
            {copy("Rechercher un membre")}{" "}
            <span className="request-search-input">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                maxLength={254}
                value={filters.search}
                onChange={(e) => update({ search: e.target.value })}
                placeholder={copy("Nom, prénom ou email…")}
                aria-label={copy("Rechercher par nom, prénom ou email")}
              />
            </span>
          </label>
          <label>
            {copy("Trier par date")}{" "}
            <select
              value={filters.order}
              onChange={(e) => update({ order: e.target.value as RequestFilters["order"] })}
            >
              <option value="recent"> {copy("Les plus récentes")} </option>
              <option value="oldest"> {copy("Les plus anciennes")} </option>
            </select>
          </label>
          <label>
            {copy("Groupe")}{" "}
            <select value={filters.groupId} onChange={(e) => update({ groupId: e.target.value })}>
              <option value=""> {copy("Tous les groupes")} </option>
              {store.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="request-filter-actions">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={advanced}
            aria-controls={`${id}-advanced`}
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" /> {copy("Filtres avancés")}{" "}
            {periodApplied && (
              <span className="request-period-dot" aria-label={copy("Période active")} />
            )}
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={advanced ? "request-chevron-open" : ""}
            />
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw size={14} aria-hidden="true" /> {copy("Réinitialiser")}{" "}
          </Button>
        </div>
        <form
          id={`${id}-advanced`}
          className="request-advanced"
          hidden={!advanced}
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalidRange) update({ start: period.start, end: period.end });
          }}
        >
          <div className="request-period-fields">
            <label>
              {copy("Date de début")}{" "}
              <input
                type="date"
                value={period.start}
                aria-invalid={invalidRange}
                aria-describedby={`${id}-period-help${invalidRange ? ` ${id}-period-error` : ""}`}
                onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
              />
            </label>
            <label>
              {copy("Date de fin")}{" "}
              <input
                type="date"
                value={period.end}
                aria-invalid={invalidRange}
                aria-describedby={`${id}-period-help${invalidRange ? ` ${id}-period-error` : ""}`}
                onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
              />
            </label>
            <Button type="submit" size="sm" disabled={invalidRange || !periodChanged}>
              {copy("Appliquer la période")}{" "}
            </Button>
          </div>
          <p id={`${id}-period-help`} className="tiny muted">
            {copy(
              "Pour une journée précise, choisissez la même date de début et de fin. Une seule borne suffit également.",
            )}{" "}
          </p>
          {invalidRange && (
            <p id={`${id}-period-error`} className="error" role="alert">
              {copy("La date de fin doit être postérieure ou égale à la date de début.")}{" "}
            </p>
          )}
          {periodApplied && !periodChanged && (
            <p className="tiny request-period-confirmed" role="status">
              {copy("Période appliquée.")}{" "}
            </p>
          )}
        </form>
        <div
          id={`${id}-results`}
          role="tabpanel"
          aria-labelledby={`${id}-${filters.status}`}
          tabIndex={0}
          aria-busy={store.loading}
        >
          {store.syncErrors.users && (
            <div className="request-error" role="alert">
              <p className="error">{copy(store.syncErrors.users)}</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={store.loading}
                onClick={() => void store.sync()}
              >
                {copy("Réessayer")}{" "}
              </Button>
            </div>
          )}
          <p className="request-results-count" role="status" aria-live="polite">
            {store.loading
              ? copy("Actualisation des membres…")
              : copy("{count} résultat(s) sur {total} compte(s)", {
                  count: results.length,
                  total: store.users.length,
                })}
          </p>
          <div
            className={`table-wrap request-table ${styles.table}`}
            role="region"
            aria-label={copy("Liste des membres")}
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                {copy("Membres correspondant aux filtres sélectionnés")}{" "}
              </caption>
              <thead>
                <tr>
                  <th scope="col"> {copy("Membre")} </th>
                  <th scope="col"> {copy("Inscription")} </th>
                  <th scope="col"> {copy("Statut")} </th>
                  <th scope="col"> {copy("Groupe")} </th>
                  <th scope="col"> {copy("Actions")} </th>
                </tr>
              </thead>
              <tbody>
                {store.loading && !store.users.length && (
                  <tr>
                    <td colSpan={5}>
                      <div className="request-loading" role="status">
                        <span className="skeleton" />
                        {copy("Chargement des membres…")}{" "}
                      </div>
                    </td>
                  </tr>
                )}
                {results.slice((currentPage - 1) * 10, currentPage * 10).map((u) => (
                  <tr key={u.id} className={styles.memberRow}>
                    <td data-label={copy("Membre")} className={styles.identity}>
                      <div className={styles.member}>
                        <Avatar user={u} />
                        <div className={styles.memberText}>
                          <strong>
                            {u.firstName} {u.lastName}
                          </strong>
                          <span className="table-email" title={u.email}>{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label={copy("Inscription")} className={styles.date}>
                      <span className={styles.infoLabel} aria-hidden="true"><CalendarDays size={14} />{copy("Inscription")}</span>
                      <time dateTime={u.joinedAt}>{new Date(u.joinedAt).toLocaleDateString(
                        currentLanguage() === "en" ? "en-GB" : "fr-FR",
                      )}</time>
                    </td>
                    <td data-label={copy("Statut")} className={styles.status}>
                      <StatusBadge status={u.status} />
                    </td>
                    <td data-label={copy("Groupes")} className={styles.groups}>
                      <span className={styles.infoLabel} aria-hidden="true"><Users size={14} />{copy("Groupes")}</span>
                      {groupsFor(u.id)}
                    </td>
                    <td data-label={copy("Actions")} className={styles.actionsCell}>
                      <div className={`${styles.actions} ${u.status === "APPROVED" ? styles.approvedActions : ""}`}>
                        <Button size="sm" variant="secondary" onClick={() => setDetailId(u.id)}>
                          <Eye size={14} aria-hidden="true" />
                          {copy("Consulter")}{" "}
                        </Button>
                        {u.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              disabled={!!busy}
                              onClick={() => setDecision({ user: u, status: "APPROVED" })}
                            >
                              <Check size={14} aria-hidden="true" />
                              {copy("Accepter")}{" "}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!!busy}
                              onClick={() => setDecision({ user: u, status: "REJECTED" })}
                            >
                              <X size={14} aria-hidden="true" />
                              {copy("Refuser")}{" "}
                            </Button>
                          </>
                        )}
                        {u.status === "APPROVED" && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setGroupsId(u.id)}>
                              <Users size={14} aria-hidden="true" />
                              {copy("Voir les groupes")}{" "}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setAssignmentId(u.id)}
                            >
                              <UserPlus size={14} aria-hidden="true" />
                              {copy("Affecter à un groupe")}{" "}
                            </Button>
                            {isAdmin && u.role !== "ADMIN" && (
                              <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => setBanTarget(u)}>
                                <Ban size={14} aria-hidden="true" />{copy("Bannir")}
                              </Button>
                            )}
                          </>
                        )}
                        {u.status === "REJECTED" && (
                          <Button size="sm" variant="secondary" onClick={() => setDetailId(u.id)}>
                            <History size={14} aria-hidden="true" />
                            {copy("Afficher l’historique")}{" "}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!results.length && !store.loading && !store.syncErrors.users && (
            <Empty
              title={
                store.users.length
                  ? copy("Aucun membre ne correspond")
                  : copy("Aucun membre pour le moment")
              }
            >
              {store.users.length
                ? copy("Essayez un autre statut ou ajustez vos filtres pour retrouver une demande.")
                : copy(
                    "Les nouvelles demandes d’adhésion apparaîtront ici dès l’inscription d’un membre.",
                  )}
            </Empty>
          )}
          {!results.length &&
            !store.loading &&
            !store.syncErrors.users &&
            store.users.length > 0 && (
              <div className="request-empty-action">
                <Button variant="secondary" onClick={reset}>
                  {copy("Réinitialiser les filtres")}{" "}
                </Button>
              </div>
            )}
          {results.length > 0 && (
            <nav
              className="row wrap between request-pagination"
              aria-label={copy("Pagination des demandes")}
            >
              <Button
                variant="secondary"
                disabled={currentPage === 1 || store.loading}
                onClick={() => setPage(currentPage - 1)}
              >
                {copy("Précédent")}{" "}
              </Button>
              <span>
                {copy("Page")} {currentPage} {copy("sur")} {pages}
              </span>
              <Button
                variant="secondary"
                disabled={currentPage === pages || store.loading}
                onClick={() => setPage(currentPage + 1)}
              >
                {copy("Suivant")}{" "}
              </Button>
            </nav>
          )}
        </div>
        {banTarget && (
          <Modal open onClose={() => { if (!busy) setBanTarget(null); }} title={copy("Bannir et supprimer ce compte ?")}>
            <p className={styles.banIdentity}><strong>{banTarget.firstName} {banTarget.lastName}</strong><br />{banTarget.email}</p>
            <p>{copy("Le compte et ses données associées seront définitivement supprimés. Le membre sera retiré de tous les groupes et ses sessions seront déconnectées. Cette action est irréversible.")}</p>
            <div className="row wrap">
              <Button variant="secondary" disabled={!!busy} onClick={() => setBanTarget(null)}>{copy("Annuler")}</Button>
              <Button variant="destructive" disabled={!!busy} onClick={async () => {
                if (busy) return;
                setBusy(banTarget.id);
                const saved = await attempt(() => store.ban(banTarget.id), copy("Compte supprimé et membre retiré de tous les groupes."));
                setBusy(null);
                if (saved) setBanTarget(null);
              }}>
                <Ban size={16} aria-hidden="true" />{busy ? copy("Suppression…") : copy("Bannir et supprimer")}
              </Button>
            </div>
          </Modal>
        )}
        {detail && (
          <Modal open onClose={() => setDetailId(null)} title={copy("Détails du membre")}>
            <dl className="form-stack">
              <div>
                <dt> {copy("Nom complet")} </dt>
                <dd>
                  {detail.firstName} {detail.lastName}
                </dd>
              </div>
              <div>
                <dt> {copy("Email")} </dt>
                <dd>{detail.email}</dd>
              </div>
              <div>
                <dt> {copy("Date de demande")} </dt>
                <dd>
                  {new Date(detail.joinedAt).toLocaleString(
                    currentLanguage() === "en" ? "en-GB" : "fr-FR",
                  )}
                </dd>
              </div>
              <div>
                <dt> {copy("Statut")} </dt>
                <dd>
                  <StatusBadge status={detail.status} />
                </dd>
              </div>
              <div>
                <dt> {copy("Groupes")} </dt>
                <dd>{groupsFor(detail.id)}</dd>
              </div>
              <div>
                <dt> {copy("Présentation")} </dt>
                <dd>{detail.bio || copy("Non renseignée")}</dd>
              </div>
            </dl>
            <DecisionHistory key={detail.id} userId={detail.id} />
          </Modal>
        )}
        {decision && (
          <Modal
            open
            onClose={() => {
              if (!busy) setDecision(null);
            }}
            title={
              decision.status === "APPROVED"
                ? copy("Accepter cette demande ?")
                : copy("Refuser cette demande ?")
            }
          >
            <p>
              {decision.user.firstName} {decision.user.lastName} · {decision.user.email}
            </p>
            <p> {copy("Cette décision est définitive dans le parcours actuel.")} </p>
            <div className="row wrap">
              <Button variant="secondary" disabled={!!busy} onClick={() => setDecision(null)}>
                {" "}
                {copy("Annuler")}{" "}
              </Button>
              <Button disabled={!!busy} onClick={() => void review(decision.user, decision.status)}>
                {busy ? copy("Enregistrement…") : copy("Confirmer la décision")}
              </Button>
            </div>
          </Modal>
        )}
        {groupsId && <MemberGroups userId={groupsId} close={() => setGroupsId(null)} />}
        {assignment && (
          <Assignment key={assignment.id} user={assignment} close={() => setAssignmentId(null)} />
        )}
      </section>
    </>
  );
}

function DecisionHistory({ userId }: { userId: string }) {
  const { text: copy } = useCopy();
  const load = useCallback(() => usersService.decisions(userId), [userId]);
  const remote = useRemote<AdmissionDecision[]>(load);
  return (
    <section>
      <h3> {copy("Historique des décisions")} </h3>
      <LoadState {...remote} retry={remote.refresh} />
      {remote.data?.map((entry) => (
        <p key={entry.id}>
          {new Date(entry.createdAt).toLocaleString(currentLanguage() === "en" ? "en-GB" : "fr-FR")}{" "}
          · {entry.status === "APPROVED" ? copy("Acceptée") : copy("Refusée")} {copy("par")}{" "}
          {entry.actor.firstName} {entry.actor.lastName}
        </p>
      ))}
      {remote.data?.length === 0 && (
        <p className="muted">
          {" "}
          {copy(
            "Aucune décision historisée. Les décisions antérieures à cette version ne disposent pas d’une date ni d’un auteur enregistrés.",
          )}{" "}
        </p>
      )}
    </section>
  );
}

function MemberGroups({ userId, close }: { userId: string; close: () => void }) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const user = store.users.find((member) => member.id === userId);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={`Groupes de ${user.firstName}`}
    >
      <p className="muted">
        {" "}
        {copy(
          "Le groupe général est automatique. Les administrateurs ne peuvent pas être retirés d’un groupe.",
        )}{" "}
      </p>
      {store.groups
        .filter((group) => group.memberIds.includes(userId))
        .map((group) => (
          <div className="setting-row" key={group.id}>
            <strong>{group.name}</strong>
            {!group.isGeneral && user.role !== "ADMIN" && (
              <Button variant="secondary" disabled={busy} onClick={() => setRemoving(group.id)}>
                {" "}
                {copy("Retirer")}{" "}
              </Button>
            )}
          </div>
        ))}
      {removing && (
        <div role="alert">
          <p> {copy("Confirmer le retrait de ce groupe privé ?")} </p>
          <div className="row wrap">
            <Button disabled={busy} variant="secondary" onClick={() => setRemoving(null)}>
              {" "}
              {copy("Annuler")}{" "}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const saved = await attempt(
                  () => store.membership(removing, userId, false),
                  copy("Affectation retirée"),
                );
                setBusy(false);
                if (saved) setRemoving(null);
              }}
            >
              {" "}
              {copy("Confirmer le retrait")}{" "}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
