"use client";
import { useCopy, currentLanguage } from "@/lib/i18n";
import { useId, useState } from "react";
import { Search, RotateCcw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useCommunity } from "@/stores/community";
import { Avatar, attempt } from "@/components/shared";
import { PrivateImage } from "@/components/private-image";
import { useImagePreview } from "@/hooks/use-image-preview";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import type { Group } from "@/types";
import { defaultRequestFilters, filterRequests, isValidRequestPeriod } from "@/features/requests";
import { addSelectedGroupMembers } from "@/features/group-creation";
import { groupsService } from "@/services/groups.service";
const groupSchema = z.object({
  name: z.string().trim().min(2, "Au moins 2 caractères.").max(80),
  description: z.string().trim().max(500),
});
export function GroupEditor({
  group,
  close,
  onSaved,
}: {
  group?: Group;
  close: () => void;
  onSaved?: (group: Group) => void;
}) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const { file, preview, select } = useImagePreview();
  const [savedId, setSavedId] = useState(group?.id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [memberFilters, setMemberFilters] = useState({ search: "", start: "", end: "" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const pickerId = useId();
  const invalidRange = !isValidRequestPeriod(memberFilters.start, memberFilters.end);
  const approved = store.users.filter((u) => u.status === "APPROVED");
  const candidates = filterRequests(store.users, {
    ...defaultRequestFilters,
    ...memberFilters,
    status: "APPROVED",
  });
  const selectedCount = approved.filter(
    (u) => u.role === "USER" && selectedIds.includes(u.id),
  ).length;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof groupSchema>>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: group?.name ?? "", description: group?.description ?? "" },
  });
  return (
    <Modal
      open
      onClose={() => {
        if (!isSubmitting) close();
      }}
      title={group ? copy("Modifier le groupe") : copy("Créer un groupe")}
    >
      <form
        className="form-stack"
        onSubmit={handleSubmit((v) =>
          attempt(async () => {
            setSaveError(null);
            let createdId = savedId;
            try {
              let saved = await store.saveGroup({
                ...v,
                id: savedId ?? crypto.randomUUID(),
                color: group?.color ?? "#d7c5f7",
                isGeneral: group?.isGeneral ?? false,
                memberIds: group?.memberIds ?? [],
              });
              setSavedId(saved.id);
              createdId = saved.id;
              if (!group) {
                saved = await addSelectedGroupMembers(
                  useCommunity.getState().groups.find((g) => g.id === saved.id) ?? saved,
                  useCommunity.getState().users,
                  selectedIds,
                  (id, userId) => groupsService.member(id, userId, true),
                  store.receiveGroup,
                );
              }
              if (file) await store.groupImage(saved.id, file);
              close();
              onSaved?.(saved);
            } catch (error) {
              setSaveError(
                !group && createdId
                  ? copy(
                      "Le groupe est créé, mais son enregistrement est incomplet. Réessayez pour terminer les ajouts ou l’image, sans recréer le groupe.",
                    )
                  : copy(
                      "L’enregistrement a échoué. Vos informations et votre sélection sont conservées.",
                    ),
              );
              throw error;
            }
          }, copy("Groupe enregistré")),
        )}
      >
        <label>
          {copy("Nom du groupe")} <input {...register("name")} disabled={isSubmitting} />
          <small className="error">{errors.name?.message}</small>
        </label>
        <label>
          {copy("Description")} <textarea {...register("description")} disabled={isSubmitting} />
          <small className="error">{errors.description?.message}</small>
        </label>
        <label>
          {copy("Image du groupe")}{" "}
          <input
            type="file"
            disabled={isSubmitting}
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={async (e) => {
              try {
                select(e.target.files?.[0]);
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          />
        </label>
        {(preview || group?.image) && (
          <PrivateImage
            className="image-preview"
            src={preview ?? group?.image}
            alt={copy("Image du groupe")}
          />
        )}
        {!group && (
          <fieldset className="group-member-picker" disabled={isSubmitting}>
            <legend> {copy("Ajouter des membres approuvés")} </legend>
            <p className="small muted">
              {copy(
                "Choisissez les membres à ajouter au nouveau groupe. Les administrateurs approuvés sont ajoutés automatiquement.",
              )}{" "}
            </p>
            <label>
              {copy("Rechercher par nom, prénom ou email")}{" "}
              <span className="request-search-input">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  maxLength={254}
                  placeholder={copy("Nom, prénom ou email…")}
                  value={memberFilters.search}
                  onChange={(e) => setMemberFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </span>
            </label>
            <div className="group-member-dates">
              <label>
                {copy("Inscrit à partir du")}{" "}
                <input
                  type="date"
                  value={memberFilters.start}
                  aria-invalid={invalidRange}
                  aria-describedby={invalidRange ? `${pickerId}-date-error` : undefined}
                  onChange={(e) => setMemberFilters((f) => ({ ...f, start: e.target.value }))}
                />
              </label>
              <label>
                {copy("Inscrit jusqu’au")}{" "}
                <input
                  type="date"
                  value={memberFilters.end}
                  aria-invalid={invalidRange}
                  aria-describedby={invalidRange ? `${pickerId}-date-error` : undefined}
                  onChange={(e) => setMemberFilters((f) => ({ ...f, end: e.target.value }))}
                />
              </label>
            </div>
            {invalidRange && (
              <p id={`${pickerId}-date-error`} className="error" role="alert">
                {copy("La date de fin doit être postérieure ou égale à la date de début.")}{" "}
              </p>
            )}
            <div className="row between wrap group-member-summary">
              <span className="tiny muted" role="status">
                {candidates.length} {copy("utilisateur")} {candidates.length !== 1 ? "s" : ""} ·{" "}
                {selectedCount} {copy("sélectionné")} {selectedCount !== 1 ? "s" : ""}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMemberFilters({ search: "", start: "", end: "" })}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {copy("Réinitialiser les filtres")}{" "}
              </Button>
            </div>
            {store.loading && (
              <p className="tiny muted" role="status">
                {copy("Actualisation des utilisateurs…")}{" "}
              </p>
            )}
            {store.error && (
              <div role="alert">
                <p className="error">
                  {" "}
                  {copy("La liste n’a pas pu être actualisée :")} {store.error}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={store.loading}
                  onClick={() => void store.sync()}
                >
                  {copy("Réessayer")}{" "}
                </Button>
              </div>
            )}
            <div className="group-member-options" aria-label={copy("Utilisateurs approuvés")}>
              {candidates.map((member) => (
                <label className="membership-row" key={member.id}>
                  <span className="row group-member-person">
                    <Avatar user={member} size="small-avatar" />
                    <span>
                      <strong>
                        {member.firstName} {member.lastName}
                      </strong>
                      <span className="group-member-email">{member.email}</span>
                      <span className="tiny muted">
                        {copy("Inscrit le")}{" "}
                        {new Date(member.joinedAt).toLocaleDateString(
                          currentLanguage() === "en" ? "en-GB" : "fr-FR",
                        )}
                        {member.role === "ADMIN" ? " · Admin, ajout automatique" : ""}
                      </span>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={member.role === "ADMIN" || selectedIds.includes(member.id)}
                    disabled={member.role === "ADMIN"}
                    aria-label={`Ajouter ${member.firstName} ${member.lastName} au groupe`}
                    onChange={(e) =>
                      setSelectedIds((ids) =>
                        e.target.checked
                          ? [...new Set([...ids, member.id])]
                          : ids.filter((id) => id !== member.id),
                      )
                    }
                  />
                </label>
              ))}
              {!candidates.length && !store.loading && !store.error && !invalidRange && (
                <p className="small muted">
                  {approved.length
                    ? copy("Aucun utilisateur ne correspond aux filtres.")
                    : copy("Aucun utilisateur approuvé pour le moment.")}
                </p>
              )}
            </div>
            <p className="tiny muted">
              {copy(
                "La sélection est conservée lorsque vous changez les filtres. Vous pouvez créer le groupe sans ajouter de membre.",
              )}{" "}
            </p>
          </fieldset>
        )}
        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}
        <Button type="submit" disabled={isSubmitting || (!group && invalidRange)}>
          {isSubmitting
            ? copy("Enregistrement…")
            : group
              ? copy("Enregistrer le groupe")
              : savedId
                ? copy("Terminer la création")
                : `Créer le groupe${selectedCount ? ` avec ${selectedCount} membre${selectedCount > 1 ? "s" : ""}` : ""}`}
        </Button>
      </form>
    </Modal>
  );
}
