# Chtaw Team — sondages de séance et présences

Livraison locale du 3 novembre 2026. Implémentation dans les projets existants `chtaw-team-backend` et `chtaw-team-pwa`.

## Fonctionnement livré

- Admin → Sondages : création d’un sondage ordinaire ou d’une séance, titre, description, groupe, clôture, statut et horaires dynamiques.
- Séances : 1 à 100 horaires datés ; plafond technique de validation, sans logique métier limitée à deux ou trois horaires. Les sondages ordinaires conservent leurs 2 à 8 réponses.
- Étudiant : choix multiples, confirmation, modification du vote avant clôture et avant pointage, affichage des horaires choisis et historique dans Mon profil.
- Admin : listes automatiques par horaire, recherche nom/email, pointage NON_VERIFIE / PRESENT / ABSENT, enregistrement groupé et corrections versionnées.
- Historique : sélection des horaires, résultat final, journal des corrections avec administrateur, date, ancien et nouveau statut.
- Dashboard et onglet Présences et alertes : statistiques réelles, recherche, filtres groupe/date/sondage/seuil, tri et pagination côté backend.
- Alertes persistantes au franchissement de trois absences : lecture, historique, résolution après correction ou annulation, nouvel événement uniquement lors d’un nouveau franchissement.
- Aucun email externe. Aucun faux contenu dans les écrans finaux.

## Règles et conservation des données

`Poll`, `PollOption`, `PollVote` et `PollVoteOption` sont réutilisés. Les anciennes données deviennent ORDINARY / OPEN par défaut et gardent leurs votes définitifs.

Une présence est stockée directement sur une sélection existante. La combinaison des clés uniques existantes garantit une seule sélection et une seule présence par étudiant et horaire.

Le résultat final est calculé : aucune sélection → NON_INSCRIT ; au moins un PRESENT → PRESENT ; sinon tous ABSENT → ABSENT ; sinon EN_ATTENTE. Une séance annulée est ANNULE et exclue des totaux. Le décompte compte des votes sur des sondages distincts, jamais des horaires.

`AbsenceState` mémorise un total recompté depuis les votes et la génération d’alerte. Ce total n’est jamais incrémenté par pointage. `AbsenceAlert` possède une contrainte unique étudiant/génération. Les recalculs et la génération/résolution des alertes sont transactionnels sous verrou étudiant.

Les horaires peuvent être ajoutés, retirés ou modifiés tant qu’il n’existe aucun vote. Ils sont immuables dès le premier vote afin de préserver les inscriptions. Le premier enregistrement de présence verrouille aussi les votes et la date limite. Ensuite, restent possibles la correction du pointage, la modification du titre/description, la clôture et l’annulation. Une annulation est définitive.

Chaque pointage attend une version de la sélection. Deux écritures concurrentes avec la même version donnent un succès et un conflit 409 ; le second administrateur doit actualiser. Les verrous suivent l’ordre groupe, sondage, étudiants triés. Une correction de plusieurs horaires est atomique.

Un retrait de groupe interdit de nouveaux votes mais conserve les inscriptions et l’historique existants. Un groupe possédant un historique de présence ne peut pas être supprimé : l’API retourne un conflit explicite, afin de conserver les journaux et les absences.

Les seuls rôles existants sont ADMIN et USER. Ils sont conservés. Les actions admin exigent un administrateur approuvé et, pour une séance, membre du groupe concerné. Un étudiant ne consulte que son propre historique et ne modifie aucun pointage. Les sondages de séance réservent les inscriptions aux étudiants.

Le seuil d’alerte et le tri des étudiants utilisent leur total global, même en filtrant un seul sondage. Les indicateurs et les décomptes par période suivent les séances filtrées ; les deux valeurs sont distinguées dans l’interface. Les dates du filtre correspondent à la création des sondages, en UTC. Les horaires sont saisis et affichés en heure locale, et transportés en ISO UTC.

## Migrations

Migrations additives appliquées avec succès aux bases locales `chtaw` et `chtaw_test` :

1. `202611030003_session_attendance` : types et colonnes séance/présence, tables AttendanceEdit, AbsenceState et AbsenceAlert, clés étrangères et index.
2. `202611030004_vote_user_index` : index des votes par étudiant et sondage pour les recomptages et historiques.

Le client Prisma a été régénéré. Aucune suppression des sondages ni des votes existants. Les suites d’intégration utilisent uniquement la base jetable `chtaw_test`, avec contrôle explicite de son nom.

## API

Préfixe existant `/api/v1`.

| Route | Fonction |
|---|---|
| POST /groups/:groupId/polls | Étendue aux séances et horaires datés ; comportement ordinaire conservé |
| GET /polls et GET /polls/:id | Type, description, statut, dates et verrou de pointage |
| POST /polls/:id/votes | Vote initial avec contrôles de clôture et de verrouillage |
| PUT /polls/:id/votes | Remplacement d’un vote de séance avant clôture/pointage |
| PATCH /polls/:id | Modification, clôture ou annulation d’une séance |
| GET /polls/:id/attendance | Inscrits et pointages par horaire, résultats finaux et totaux |
| PUT /polls/:id/attendance | Pointages et corrections avec versions attendues |
| GET /admin/attendance | Statistiques et tableau filtré/paginé |
| GET /users/:id/attendance | Historique individuel administrateur |
| GET /attendance/me | Historique du compte connecté |
| GET /admin/absence-alerts | Alertes actives et résolues |
| PATCH /admin/absence-alerts/:id/read | Marquage de lecture idempotent |

Les changements de sondages et le verrouillage du pointage utilisent les événements Socket.IO existants. Les alertes admin sont relues toutes les 30 secondes dans les écrans concernés et à leur actualisation. Aucune notification n’est créée par une simple lecture de page. Le projet ne possédait pas de système de notifications persistantes compatible ; les alertes d’absence sont donc une fonctionnalité backend dédiée, sans nouveau système de messagerie.

## Fichiers créés ou modifiés

Backend :

- `prisma/schema.prisma`
- Les deux migrations ci-dessus
- `src/app.module.ts`
- `src/common/presenters.ts`
- `src/groups/groups.service.ts`
- `src/polls/polls.module.ts`, `polls.dto.ts`, `polls.validation.ts`
- `src/polls/attendance.controller.ts`, `attendance.dto.ts`, `attendance.service.ts`, `attendance.rules.ts`
- `test/attendance.spec.ts`, `test/attendance.integration.ts`

PWA :

- `src/types/index.ts`
- `src/services/polls.service.ts`, `attendance.service.ts`
- `src/stores/community.ts`
- `src/components/admin/admin-screen.tsx`, `attendance-panel.tsx`
- `src/components/polls/poll-card.tsx`
- `src/components/account-screen.tsx`
- `src/styles/globals.css`
- `src/features/session-polls.ts`, `session-polls.test.ts`
- `test/community.integration.ts`

Le site vitrine, le dossier Application, `profiles.approved`, `app_config`, les rôles et l’authentification restent inchangés.

## Vérifications automatisées

| Vérification | Résultat |
|---|---|
| Tests unitaires backend | 38 réussis |
| Intégration backend PostgreSQL et Socket.IO | 44 réussis |
| Tests unitaires PWA | 33 réussis |
| Intégration PWA → NestJS → PostgreSQL et Socket.IO | 14 réussis |
| TypeScript backend et PWA | Réussi |
| Lint backend et PWA | Réussi |
| Build backend et PWA | Réussi |
| Validation du schéma Prisma | Réussie |

Les scénarios couvrent : 1/2/3/5/10 horaires (ainsi que 100 dans les règles unitaires), votes multiples et modifiés, synchronisation des inscrits, présence partielle, tous absents, non-vérifié, non-inscrit, absence unique par sondage, trois sondages distincts, alerte et déduplication, lecture, correction et recalcul, résolution et nouveau franchissement, annulation, autorisations, retrait du groupe, persistance après restauration de session, concurrence des pointages, changement des horaires avant vote, clôture et compatibilité des sondages ordinaires. Les filtres combinés avec un seuil global et un sondage individuel sont également testés.

## Problèmes rencontrés et limites de vérification

- Le lint React interdisait un changement d’état synchrone au démarrage d’un effet : le chargement est désormais dérivé de la requête courante et les réponses périmées sont ignorées.
- Les filtres conservent leur interface et leur focus pendant le chargement des résultats.
- Le test frontend simulant une actualisation devait réouvrir son historique de discussion avant le scénario suivant : le harnais de test a été corrigé.
- Le pilote PostgreSQL émet un avertissement de dépréciation concernant les requêtes concurrentes sur un client. Les tests passent ; aucune dépendance n’a été mise à jour dans cette mission.
- Aucun contrôle visuel dans un navigateur ni sur un appareil mobile réel n’a été effectué. L’automatisation du navigateur Windows avait été bloquée lors de la tentative précédente ; les vérifications ci-dessus ne remplacent pas ce contrôle visuel.

À vérifier manuellement : création d’une séance dans Admin → Sondages, navigation au clavier dans les modales, lisibilité des listes et défilement des tableaux sur ordinateur/mobile, vote depuis un compte étudiant, pointage depuis un autre navigateur admin, affichage/lecture de l’alerte et restauration après rechargement. Les mises en page utilisent les composants et les règles responsive existants, avec retours à la ligne et défilement horizontal des tableaux.

Aucun déploiement distant ni publication Git n’a été effectué.
