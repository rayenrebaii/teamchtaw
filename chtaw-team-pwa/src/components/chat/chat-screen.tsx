"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Search,
  Send,
  ImagePlus,
  ChartNoAxesColumn,
  Users,
  ArrowUpRight,
  MessageCircle,
  Hash,
  X,
  Plus,
} from "lucide-react";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Avatar, Empty, attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { PollCard } from "@/components/polls/poll-card";
import { PublishDialog } from "./publish-dialogs";
import { PrivateImage } from "@/components/private-image";
import { GroupMembers } from "./group-members";
import { AddGroupMembers } from "./add-group-members";
import { GroupEditor } from "@/components/groups/group-editor";
export function ChatScreen({ groupId, focusMessage, focusPoll }: { groupId?: string; focusMessage?: string; focusPoll?: string }) {
  const store = useCommunity();
  const { t, locale, error } = useCopy();
  const router = useRouter();
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const user = store.users.find((u) => u.id === store.session?.userId);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [publish, setPublish] = useState<"photo" | "poll" | null>(null);
  const [photo, setPhoto] = useState<string>();
  const [info, setInfo] = useState(false);
  const [sending, setSending] = useState(false);
  const loadingOlder = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const groups = store.groups.filter(
    (g) => user?.role === "ADMIN" || g.memberIds.includes(user?.id ?? ""),
  );
  const group = groups.find((g) => g.id === groupId);
  const messages = store.messages.filter((m) => m.groupId === group?.id);
  const messageCount = messages.length;
  const history = groupId ? store.history[groupId] : undefined;
  const loadHistory = store.loadHistory;
  useEffect(() => {
    if (groupId) void loadHistory(groupId);
  }, [groupId, loadHistory]);
  useEffect(() => {
    if (!loadingOlder.current && !focusMessage && !focusPoll) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount, groupId, focusMessage, focusPoll]);
  const targetMessage = messages.find((message) => message.id === focusMessage || (!!focusPoll && message.pollId === focusPoll))?.id;
  useEffect(() => {
    if (!focusMessage && !focusPoll) return;
    if (targetMessage) { document.getElementById("message-" + targetMessage)?.scrollIntoView({ block: "center" }); return; }
    if (groupId && history?.loaded && !history.loading && !history.error && history.nextCursor) void loadHistory(groupId, true);
  }, [focusMessage, focusPoll, targetMessage, groupId, history, loadHistory]);
  if (!user) return null;
  return (
    <div className={`chat-layout ${groupId ? "has-conversation" : ""}`}>
      <aside className="conversation-list">
        <div className="conversation-title">
          <span className="eyebrow">{t("ON GARDE LE LIEN")}</span>
          <div className="row between">
            <h1>{t("Conversations")}<span className="title-dot">.</span>
            </h1>
            <span className="count-badge">{groups.length}</span>
          </div>
          <p className="small muted">{t("Votre dose quotidienne d’esprit d’équipe.")}</p>
          {user.role === "ADMIN" && (
            <Button className="conversation-create-group" onClick={() => setCreatingGroup(true)}>
              <Plus size={17} aria-hidden="true" /> Créer un groupe
            </Button>
          )}
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label={t("Rechercher un groupe")}
              placeholder={t("Rechercher une conversation")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="list-caption">
          {t("VOS GROUPES")} <span>{groups.length}</span>
        </div>
        <div className="group-list">
          {groups
            .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
            .map((g) => {
              const latest = store.messages.filter((m) => m.groupId === g.id).at(-1);
              return (
                <Link
                  key={g.id}
                  href={`/app/groups/${g.id}`}
                  className={`group-item ${groupId === g.id ? "selected" : ""}`}
                >
                  <Avatar group={g} />
                  <div className="group-preview">
                    <div className="row between">
                      <strong>{g.isGeneral ? "Team Chtaw" : g.name}</strong>
                      <span className="tiny">
                        {latest
                          ? new Date(latest.createdAt).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                    <span className="group-subtitle">
                      {g.isGeneral
                        ? t("# Général · Toute la communauté")
                        : t("{count} membres · Groupe privé", { count: g.memberIds.length })}
                    </span>
                    <p>
                      {latest?.kind === "poll"
                        ? t("📊 Un nouveau sondage vous attend")
                        : latest?.kind === "photo"
                          ? t("📷 Un moment partagé avec la team")
                          : latest?.text || t("Ouvrir la conversation")}
                    </p>
                  </div>
                </Link>
              );
            })}
          {!groups.some((g) => g.name.toLowerCase().includes(search.toLowerCase())) && (
            <Empty title={t("Aucun groupe trouvé")}>{t("Essayez un autre nom.")}</Empty>
          )}
        </div>
        {user.role !== "ADMIN" && <div className="team-card">
          <span>↗</span>
          <strong>{t("Chaque message nous rapproche.")}</strong>
          <p>{t("Un objectif commun. Une énergie collective.")}</p>
          <span className="tiny">{t("C’EST ÇA, L’ESPRIT CHTAW.")}</span>
        </div>}
        <div className="local-note">
          <span className="live-dot" />{" "}
          {store.connection === "online"
            ? t("Connecté à la team")
            : store.connection === "connecting"
              ? t("Connexion en cours…")
              : t("Connexion interrompue · Reconnexion automatique")}
        </div>
      </aside>
      {group ? (
        <motion.section
          key={group.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="conversation"
        >
          <header className="chat-header">
            <Link
              className="mobile-back icon-button"
              href="/app"
              aria-label={t("Retour aux conversations")}
            >
              <ArrowLeft size={21} />
            </Link>
            <Avatar group={group} />
            <div className="chat-heading">
              <h2>{group.name}</h2>
              <span>
                <span className="live-dot" />
                {t("{count} membres", { count: group.memberIds.length })} ·{" "}
                {group.isGeneral ? t("Le cœur de la communauté") : t("Groupe privé")}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label={t("Voir les membres")}
              title={t("Voir les membres du groupe")}
              onClick={() => {
                setInfo(true);
                void store.loadHistory(group.id);
              }}
            >
              <Users size={20} />
            </button>
            {user.role === "ADMIN" && !group.isGeneral && (
              <button
                className="icon-button"
                aria-label={t("Ajouter des membres au groupe")}
                title={t("Ajouter des membres au groupe")}
                onClick={() => {
                  setAddingGroupId(group.id);
                  void store.sync();
                }}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            )}
          </header>
          {addingGroupId === group.id && user.role === "ADMIN" && !group.isGeneral && (
            <AddGroupMembers key={group.id} group={group} close={() => setAddingGroupId(null)} />
          )}
          <div className="chat-banner">
            <Hash size={14} />
            <span>{t("Un espace pour partager, se motiver et avancer ensemble.")}</span>
          </div>
          <div className="messages" ref={scroll}>
            {history?.nextCursor && (
              <Button
                variant="secondary"
                disabled={history.loading}
                onClick={async () => {
                  loadingOlder.current = true;
                  const before = scroll.current?.scrollHeight ?? 0;
                  await store.loadHistory(group.id, true);
                  requestAnimationFrame(() => {
                    if (scroll.current)
                      scroll.current.scrollTop += scroll.current.scrollHeight - before;
                    loadingOlder.current = false;
                  });
                }}
              >{t("Charger les messages précédents")}</Button>
            )}
            {history?.loading && !history.loaded && (
              <div className="skeleton" aria-label={t("Chargement des messages")} />
            )}
            {history?.error && (
              <div role="alert">
                <p>{error(history.error)}</p>
                <Button onClick={() => void store.loadHistory(group.id)}>{t("Réessayer")}</Button>
              </div>
            )}
            {messages.map((m, index) => {
              if (m.kind === "system")
                return (
                  <div className="system-message" key={m.id}>
                    <span>
                      {new Date(m.createdAt).toLocaleDateString(locale, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <p>{m.text}</p>
                  </div>
                );
              const sender =
                m.author ??
                store.people.find((u) => u.id === m.authorId) ??
                store.users.find((u) => u.id === m.authorId);
              const mine = m.authorId === user.id;
              const grouped =
                messages[index - 1]?.authorId === m.authorId &&
                messages[index - 1]?.kind !== "system" &&
                new Date(m.createdAt).getTime() -
                  new Date(messages[index - 1].createdAt).getTime() <
                  300000;
              const poll = store.polls.find((p) => p.id === m.pollId);
              return (
                <div
                  key={m.id}
                  id={"message-" + m.id}
                  className={`message-row ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`}
                >
                  {!mine && !grouped && <Avatar user={sender} size="small-avatar" />}
                  <div className="message-body">
                    {!grouped && (
                      <div className="sender">
                        {mine ? t("Vous") : (sender?.firstName ?? t("Membre"))}{" "}
                        {sender?.role === "ADMIN" && <span>COACH</span>}
                      </div>
                    )}
                    <div className={`bubble ${m.kind === "poll" ? "poll-bubble" : ""}`}>
                      {m.kind === "photo" && (
                        <button
                          className="photo-button"
                          onClick={() => setPhoto(m.photoUrl)}
                          aria-label={t("Agrandir la photo")}
                        >
                          <PrivateImage
                            src={m.photoUrl}
                            alt={m.text || t("Photo partagée par l’administrateur")}
                          />
                        </button>
                      )}
                      {m.text && <p>{m.text}</p>}
                      {poll && <PollCard poll={poll} />}
                      <time dateTime={m.createdAt}>
                        {new Date(m.createdAt).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {mine && <span> ✓✓</span>}
                      </time>
                    </div>
                  </div>
                </div>
              );
            })}
            {!messages.length && history?.loaded && (
              <Empty title={t("La conversation commence avec vous")}>{t("Envoyez un premier message à la team.")}</Empty>
            )}
            <div ref={bottom} />
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (sending) return;
              setSending(true);
              void attempt(async () => {
                await store.post(group.id, text.trim());
                setText((current) => (current === text ? "" : current));
              }).finally(() => setSending(false));
            }}
          >
            {user.role === "ADMIN" && (
              <>
                <button
                  type="button"
                  className="icon-button"
                  title="Publier une photo"
                  aria-label="Publier une photo"
                  onClick={() => setPublish("photo")}
                >
                  <ImagePlus size={21} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="Créer un sondage"
                  aria-label="Créer un sondage"
                  onClick={() => setPublish("poll")}
                >
                  <ChartNoAxesColumn size={21} />
                </button>
              </>
            )}
            <textarea
              rows={1}
              aria-label={t("Votre message")}
              placeholder={t("Un message pour la team…")}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              size="icon"
              type="submit"
              disabled={!text.trim() || sending}
              aria-label={t("Envoyer le message")}
            >
              <Send size={19} />
            </Button>
          </form>
          <div className="composer-note">{t("Un peu de respect, beaucoup d’esprit d’équipe. ✨")}</div>
          {publish && (
            <PublishDialog kind={publish} groupId={group.id} onClose={() => setPublish(null)} />
          )}
          <Modal open={info} onClose={() => setInfo(false)} title={group.name}>
            <p className="muted">{group.description}</p>
            <GroupMembers key={group.id} group={group} />
            <h3>{t("Les moments partagés")}</h3>
            <p className="tiny muted">{t("Photos des messages chargés dans cette conversation.")}</p>
            <div className="photo-gallery">
              {messages
                .filter((m) => m.kind === "photo")
                .map((m) => (
                  <button
                    key={m.id}
                    className="photo-button"
                    aria-label={m.text || t("Agrandir la photo")}
                    onClick={() => {
                      setInfo(false);
                      setPhoto(m.photoUrl);
                    }}
                  >
                    <PrivateImage src={m.photoUrl} alt={m.text || t("Photo de la team")} />
                  </button>
                ))}
            </div>
            {!messages.some((m) => m.kind === "photo") && (
              <p className="small muted">{t("Les photos de la team apparaîtront ici.")}</p>
            )}
            {history?.nextCursor && (
              <Button
                variant="secondary"
                disabled={history.loading}
                onClick={() => void store.loadHistory(group.id, true)}
              >{t("Charger davantage de messages et photos")}</Button>
            )}
            {user.role === "ADMIN" && (
              <Button asChild>
                <Link href={`/admin/groups/${group.id}`}>
                  Gérer ce groupe
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
            )}
          </Modal>
        </motion.section>
      ) : (
        <div className={`conversation-placeholder ${groupId ? "group-unavailable" : ""}`}>
          <div className="welcome-symbol">
            <MessageCircle size={54} />
          </div>
          <span className="eyebrow">{t("VOTRE COMMUNAUTÉ, AU MÊME ENDROIT")}</span>
          <h2>{t("On a tant de choses à se partager.")}</h2>
          <p>{t("Sélectionnez un groupe et rejoignez la conversation. La team n’attend que vous.")}</p>
          <Button asChild>
            <Link
              href={
                groups.find((g) => g.isGeneral)
                  ? `/app/groups/${groups.find((g) => g.isGeneral)!.id}`
                  : "/app"
              }
            >{t("Retrouver la team")}<ArrowUpRight size={17} />
            </Link>
          </Button>
          {groupId && <p className="error">{t("Ce groupe est introuvable ou inaccessible.")}</p>}
        </div>
      )}
      {user.role === "ADMIN" && creatingGroup && (
        <GroupEditor
          close={() => setCreatingGroup(false)}
          onSaved={(created) => {
            setSearch("");
            setInfo(false);
            router.push(`/app/groups/${created.id}`);
          }}
        />
      )}
      <Modal open={!!photo} onClose={() => setPhoto(undefined)} title={t("Un moment avec la team")}>
        {photo && (
          <PrivateImage
            className="lightbox-image"
            src={photo}
            alt={t("Photo partagée en grand format")}
          />
        )}
        <Button variant="secondary" onClick={() => setPhoto(undefined)}>
          <X size={16} />{t("Fermer")}</Button>
      </Modal>
    </div>
  );
}
