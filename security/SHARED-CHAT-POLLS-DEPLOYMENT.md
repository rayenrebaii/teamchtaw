# Sondages partagés dans les conversations et recherche des groupes

12 novembre 2026, Africa/Tunis. Corrections demandées après constat d’une bulle vide chez un collaborateur et d’une liste de groupes trop présente dans la colonne de conversations.

- Commit applicatif : `9a84cadbd3b15cc307104405aff92d43d8e2935d`, poussé normalement sur `codex/collaborator-firebase-release`.
- API Render : `dep-dbqu36uk1f9s73fbpd7g`, observée `live` sur ce commit.
- PWA Vercel : `dpl_6JuQ2ZSwpeekNGcnkVtbzsXbEiJE`, observée `READY`, avec `teamchtaw-pwa.vercel.app` affecté au même commit.
- Aucune migration ni modification de données, secrets, approbations ou configuration mobile protégée.

## Correctifs

La conversation récupérait le message du sondage, mais cherchait sa fiche uniquement dans la liste de gestion du collaborateur. Cette liste exclut volontairement les séances des autres organisateurs, ce qui produisait une bulle vide.

Les messages de groupe autorisés transportent désormais la fiche publique du sondage associé : question, créneaux et votes tels que présentés aux membres du groupe, sans les participants ou données de pointage. La conversation utilise cette fiche indépendamment des listes de gestion. Les mises à jour de sondage actualisent aussi la fiche contenue dans les messages ; une actualisation de la liste de gestion ne fait plus disparaître la séance.

Les droits restent distincts : un collaborateur membre voit la séance d’un autre organisateur dans la conversation, mais ne peut pas voter ni utiliser ses endpoints de gestion. Le vote de séance reste réservé aux clients ; les règles des sondages simples restent inchangées. Les groupes sans appartenance restent inaccessibles.

Pour les clients et collaborateurs, Groupes disponibles est maintenant un bouton compact. Les noms, statuts des demandes et boutons de demande apparaissent uniquement dans un dialogue avec recherche par nom. Le chargement est effectué à l’ouverture ; fermer le dialogue masque toute la liste. Les protections contre les demandes multiples, les demandes refusées et l’accès au contenu sont conservées.

## Vérifications

- 151 tests unitaires serveur, 145 tests d’intégration PostgreSQL/HTTP, 105 tests logiques PWA et 162 tests d’interface réussis, soit 563 tests. TypeScript, lint des fichiers modifiés et builds backend/PWA réussis.
- Nouveau cas réel d’intégration : fiche de la séance admin présente dans les messages reçus par le collaborateur ; endpoint de gestion de cette séance refusé ; groupe sans appartenance refusé. Les tests de votes des organisateurs restent bloqués comme prévu.
- Nouveaux cas d’interface : fiche absente de la liste de gestion mais visible dans le chat, actualisation de ses votes après événement, dialogue fermé par défaut, recherche par nom, statuts des demandes, fermeture et absence de contenu privé.
- Six parcours navigateur locaux puis six sur les assets publiés, à 1440/390 pixels pour les trois rôles. La fixture de gestion du collaborateur exclut explicitement la séance de l’admin, et seule la fiche jointe au message permet son affichage. Vote de séance indisponible pour l’organisateur, sondage ordinaire disponible, dialogue de recherche et demande unique corrects. Aucun débordement horizontal ni erreur JavaScript ; capture mobile du dialogue inspectée.
- Huit contrôles publics de santé et de refus d’accès sans session réussis sur Render et le proxy PWA. Une première tentative sur le proxy a rencontré un délai réseau ; la relance complète a réussi.

Les parcours navigateur interceptent toutes les API métier et WebSockets et utilisent des identités fictives, sans Service Worker. Aucun compte réel, vote ou demande d’adhésion de production n’a été créé ou modifié pour cette recette. L’API et la base PostgreSQL réelles des intégrations sont des instances temporaires isolées.
