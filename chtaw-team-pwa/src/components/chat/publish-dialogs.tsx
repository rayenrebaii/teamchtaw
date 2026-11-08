"use client";
import { useCopy } from "@/lib/i18n";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useCommunity } from "@/stores/community";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { attempt } from "@/components/shared";
import { useImagePreview } from "@/hooks/use-image-preview";
const pollSchema = z.object({
  question: z.string().trim().min(3, "Précisez votre question.").max(200),
  options: z.array(z.string().trim().min(1, "Réponse obligatoire.")).min(2).max(8),
  singleChoice: z.boolean(),
  endsAt: z.string(),
});
export function PublishDialog({
  kind,
  groupId: fixedGroupId,
  onClose,
}: {
  kind: "photo" | "poll";
  groupId?: string;
  onClose: () => void;
}) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const groupId = fixedGroupId ?? selectedGroupId;
  const { file, preview, select } = useImagePreview();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [caption, setCaption] = useState("");
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof pollSchema>>({
    resolver: zodResolver(pollSchema),
    defaultValues: { question: "", options: ["", ""], singleChoice: true, endsAt: "" },
  });
  const options = useWatch({ control, name: "options" });
  return (
    <Modal
      open
      onClose={() => {
        if (!uploading && !isSubmitting) onClose();
      }}
      title={kind === "photo" ? copy("Partager un moment") : copy("Créer un sondage")}
    >
      {kind === "photo" ? (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (uploading) return;
            void attempt(async () => {
              if (!file) throw Error(copy("Sélectionnez une photo."));
              if (!groupId) throw Error(copy("Choisissez un groupe."));
              setUploading(true);
              try {
                await store.photo(groupId, file, caption, setProgress);
                onClose();
              } finally {
                setUploading(false);
              }
            }, copy("Photo publiée"));
          }}
        >
          <label>
            {copy("Photo · 5 Mo maximum")}{" "}
            <input
              type="file"
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
          {preview && (
            <img className="image-preview" src={preview} alt={copy("Aperçu de la photo")} />
          )}
          <label>
            {copy("Légende")}{" "}
            <textarea
              maxLength={1000}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          {uploading && (
            <label>
              {copy("Téléversement :")} {progress}%<progress max={100} value={progress} />
            </label>
          )}
          <Button type="submit" disabled={uploading}>
            {uploading ? copy("Publication en cours…") : copy("Publier la photo")}
          </Button>
        </form>
      ) : (
        <form
          className="form-stack"
          onSubmit={handleSubmit((v) =>
            attempt(async () => {
              if (!groupId) throw Error(copy("Choisissez un groupe."));
              await store.publishPoll({
                ...v,
                endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : undefined,
                id: crypto.randomUUID(),
                groupId,
                authorId: store.session!.userId,
                votes: [],
                options: v.options.map((label, i) => ({ id: String(i), label })),
              });
              onClose();
            }, copy("Sondage publié")),
          )}
        >
          {!fixedGroupId && (
            <label>
              {copy("Groupe")}{" "}
              <select
                required
                value={selectedGroupId}
                disabled={isSubmitting}
                onChange={(e) => setSelectedGroupId(e.target.value)}
              >
                <option value=""> {copy("Choisir un groupe")} </option>
                {store.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {copy("Votre question")} <input {...register("question")} />
            <small className="error">{errors.question?.message}</small>
          </label>
          {options.map((_, i) => (
            <label key={i}>
              {copy("Réponse")} {i + 1}
              <div className="row">
                <input {...register(`options.${i}`)} />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      setValue(
                        "options",
                        options.filter((_, n) => n !== i),
                      )
                    }
                  >
                    {copy("Retirer")}{" "}
                  </Button>
                )}
              </div>
              <small className="error">{errors.options?.[i]?.message}</small>
            </label>
          ))}
          <Button
            variant="secondary"
            type="button"
            disabled={options.length >= 8}
            onClick={() => setValue("options", [...options, ""])}
          >
            {copy("+ Ajouter une réponse")}{" "}
          </Button>
          <label className="check-label">
            <input type="checkbox" {...register("singleChoice")} />{" "}
            {copy("Une seule réponse par participation")}{" "}
          </label>
          <label>
            {copy("Date de fin (facultative)")}{" "}
            <input type="datetime-local" {...register("endsAt")} />
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {copy("Publier le sondage")}{" "}
          </Button>
        </form>
      )}
    </Modal>
  );
}
