# Présences obligatoires Chtaw Team

Les sondages, groupes, votes, compteurs et alertes existants sont conservés. Les pointages des nouvelles séances obligatoires sont indépendants des votes.

## Règles et compatibilité

- Les nouvelles séances de l’interface sont obligatoires. Chaque créneau comporte un début et une fin, transmis en ISO UTC depuis l’heure locale saisie.
- À la création, un instantané des membres du groupe ayant `role=USER` et `status=APPROVED` est enregistré dans `SessionParticipant`. Les admins sont exclus.
- Un changement ultérieur d’adhésion, de groupe ou d’approbation ne réécrit pas cet instantané. Depuis le pointage, l’admin peut inclure explicitement un nouvel étudiant approuvé du groupe ou retirer un participant. Ces actions sont confirmées et historisées.
- Une réinclusion restaure les pointages et l’éventuelle confirmation d’absence déjà historisés ; elle ne remet pas le dossier à zéro.
- Voter indique une préférence. Un participant sans vote peut être pointé sur n’importe quel créneau. Ses votes ne sont jamais créés, modifiés ou effacés par le pointage.
- Une présence sur au moins un créneau valide toute la séance. L’étudiant est masqué des autres listes actives ; « Afficher les étudiants déjà présents » permet la consultation et la correction.
- Un pointage « Absent » isolé ne confirme pas d’absence globale. Lorsque l’admin a explicitement pointé **tous les créneaux de la séance** « Absent », une seule absence est confirmée et comptée, sans seconde confirmation. Un créneau manquant ou non vérifié laisse le dossier en attente, sauf décision globale déjà confirmée.
- Après la fin de **tous** les créneaux, un signalement est ouvert pour chaque participant inclus sans présence et sans absence déjà confirmée.
- L’admin confirme l’absence, une seule fois par étudiant/séance, ou choisit le créneau réel d’une présence oubliée. Une présence efface l’effet comptable d’une absence précédente et conserve la correction.
- Corriger une présence recalcule le dossier : tous les créneaux absents confirment une absence ; sinon, sans présence ni confirmation globale, le dossier revient en attente. Corriger un pointage exhaustivement absent en « Non vérifié » retire l’absence issue de ces pointages. Les signalements sont rouverts si nécessaire après la fin de la séance. Chaque correction est conservée.
- Le total cumule les absences confirmées dans tous les groupes. Le passage de moins de trois à trois ou plus crée une alerte. Sous trois, les alertes actives sont résolues. Aucun compte n’est automatiquement bloqué.
- Une annulation résout les signalements et exclut les absences du compteur sans effacer les données. Une séance annulée ne peut pas être rouverte.

Les anciennes séances restent en mode historique (`mandatoryAttendance=false`) : leurs votes, pointages et corrections sont conservés. Elles ne reçoivent pas de nouveaux participants ni de signalements automatiques. Aucune fin de créneau ni absence de non-votant n’est inventée pendant la migration. Pour les clients historiques, le mode historique reste explicitement disponible à la création via `mandatoryAttendance:false` ; l’interface utilise le nouveau mode.

## Stockage et migration

Migration additive : `prisma/migrations/202611040001_mandatory_attendance/migration.sql`.

- `Poll.mandatoryAttendance` : `false` pour les lignes existantes.
- `PollOption.endsAt` : nullable pour les anciennes données ; obligatoire dans le DTO des nouvelles séances.
- `SessionParticipant` : instantané, inclusion, version, confirmation globale d’absence et dates du signalement. Clé unique `(pollId,userId)`.
- `SessionMark` : pointage réel par participant/créneau, avec version. Aucune dépendance aux votes.
- `SessionAttendanceEdit` : journal append-only des pointages, confirmations, corrections, ajustements de participants et annulations, avec auteur et date.
- `AbsenceState` et `AbsenceAlert` existants : cumul partagé entre l’ancien et le nouveau fonctionnement.

Les anciennes tables et les contraintes de cohérence entre groupes sont conservées. Aucun `reset`, suppression de données, recalcul rétroactif de non-votants ni seed de production n’est nécessaire. Un groupe possédant des participants historisés ne peut pas être supprimé : annuler ses séances préserve le suivi.

## Traitement automatique et concurrence

`MandatoryAttendanceService` exécute une reprise au démarrage puis une détection toutes les 60 secondes, sans connexion admin. Il n’exige aucun service ou paquet de planification supplémentaire. Le processus API doit rester démarré ; si plusieurs instances tournent, les transactions et les clés uniques évitent les doublons.

Les lectures des signalements/séances et l’ouverture d’un pointage effectuent également un rattrapage idempotent. Une indisponibilité ou un redémarrage retarde le signalement, sans le perdre. Un seul signalement est porté par chaque participant ; une correction peut rouvrir ce dossier.

Les transactions verrouillent le groupe, la séance puis les utilisateurs dans un ordre stable. Le pointage vérifie la version de la ligne et celle du participant ; les décisions globales et ajustements vérifient la version du participant. Une modification concurrente retourne `409` et demande une actualisation. Le recalcul des compteurs et alertes fait partie de la transaction d’écriture.

## Routes et API

Page PWA protégée : `/admin/attendance`, sous le layout admin existant. Onglets : Pointage, Signalements, Historique et absences. Le suivi individuel reste aussi accessible depuis le profil et les séances.

Toutes les routes suivantes sont préfixées par `/api/v1` et réservées aux admins approuvés ayant accès au groupe :

| Méthode / route | Rôle |
| --- | --- |
| `GET /admin/attendance/sessions` | Séances, créneaux et compteurs ; groupe, séance, dates UTC, phase et pagination |
| `GET /admin/attendance/reports` | Signalements actifs/résolus ; étudiant, groupe, séance, dates et pagination |
| `GET /polls/:id/attendance` | Pointage enrichi : tous les participants, préférences de vote, statuts et versions |
| `PUT /polls/:id/attendance` | Pointages par créneau ; `entries: [{userId,optionId,status,version,participantVersion}]` |
| `PUT /polls/:id/attendance/absence/:userId` | Confirmation globale : `{version}` ; seulement après la fin et sans présence |
| `PUT /polls/:id/attendance/participants/:userId` | Ajustement explicite : `{included,version}` ; version `0` pour un ajout inédit |
| `GET /admin/attendance` | Bilan existant, désormais compatible avec les participants sans vote |
| `GET /users/:id/attendance` | Historique individuel, corrections par créneau et décisions globales |
| `GET /admin/absence-alerts` | Alertes existantes, y compris pour les non-votants |

`GET /attendance/me` reste réservé à l’historique personnel de l’étudiant connecté. Les routes existantes de création, votes et modification de séance sont réutilisées. Le DTO de séance ajoute `mandatoryAttendance:true` et `slotEndsAt`, tableau aligné sur `options` et `startsAt`. Le premier vote verrouille les créneaux ; le premier pointage ou la confirmation d’absence verrouille également les inscriptions.

## Lancement

Depuis `chtaw-team-backend` :

```powershell
npm.cmd run prisma:generate
npm.cmd run db:migrate
npm.cmd run dev
```

Depuis `chtaw-team-pwa` :

```powershell
npm.cmd run dev
```

Redémarrer les processus backend déjà ouverts après la migration pour charger le nouveau code. Pour le déploiement, appliquer la migration et générer le client avant de démarrer les nouvelles versions. Ne pas utiliser `prisma migrate reset` ni supprimer le volume PostgreSQL.

`npm.cmd run dev` utilise désormais le mode `node --watch` avec le chargement TypeScript existant : les changements de DTO et de services redémarrent le serveur. `npm.cmd start` exécute toujours `dist/main.js` ; en production, reconstruire puis redémarrer le processus après une modification. Une erreur « property mandatoryAttendance/slotEndsAt should not exist » indique un DTO chargé ne contenant pas ces validations : vérifier le processus et sa version avant de modifier le contrat ou le `ValidationPipe`.

Vérification locale réelle (avec les identifiants admin locaux déjà configurés, sans affichage de secrets) : `node scripts/verify-session-contract.cjs --probe` vérifie les rejets sans créer de données ; `node scripts/verify-session-contract.cjs` crée ou réutilise dans G1 le scénario « seance 1 » demandé, puis relit les dates en PostgreSQL. Cette seconde commande conserve la séance créée et n’est pas un seed automatique.

## Vérifications

```powershell
# Backend
npm.cmd run prisma:validate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
node scripts/prepare-test-db.mjs
npm.cmd run test:integration
npm.cmd run build

# Frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Les tests d’intégration exigent `TEST_DATABASE_URL` vers la base jetable nommée exactement `chtaw_test`. La suite API historique y prépare ses propres fixtures ; ne jamais lui fournir la base réelle. Les tests du nouveau suivi créent des identifiants uniques et ne convertissent pas les anciennes séances.

Pour la suite frontend d’intégration, démarrer `node -r ts-node/register/transpile-only scripts/start-integration.ts` depuis le backend, puis `npm.cmd run test:integration` depuis le frontend ; le serveur utilise exclusivement `chtaw_test` sur le port 3102.

Validation manuelle complémentaire : rendu mobile/PWA clair et sombre, navigation clavier des créneaux et des filtres, deux sessions admin simultanées, et observation d’un signalement apparaissant après l’échéance sans admin connecté.

## Fichiers concernés

- Schéma et migration : `prisma/schema.prisma`, `prisma/migrations/202611040001_mandatory_attendance/migration.sql`.
- Backend : `src/polls/mandatory-attendance.service.ts`, `attendance.reconcile.ts`, `attendance.service.ts`, `attendance.controller.ts`, `attendance.dto.ts`, `polls.dto.ts`, `polls.validation.ts`, `polls.module.ts`, ainsi que `src/common/presenters.ts` et `src/groups/groups.service.ts`.
- Frontend : `src/app/(admin)/admin/attendance/page.tsx`, `src/components/admin/attendance-workspace.tsx`, `attendance-panel.tsx`, `src/components/polls/poll-card.tsx`, `src/components/shell.tsx`, `src/services/attendance.service.ts`, `src/features/session-polls.ts`, `src/types/index.ts` et `src/styles/globals.css`.
- Tests : backend `test/mandatory-attendance.integration.ts`, `attendance.integration.ts`, `attendance.spec.ts`, `api.integration.ts` ; frontend `src/features/session-polls.test.ts` et `test/community.integration.ts`.

Le traitement d’une séance en erreur est isolé : le worker poursuit les autres séances et retente celle en échec au passage suivant. L’arrêt du module attend le traitement courant. La préparation de la base jetable de la suite API s’effectue avant de lancer le détecteur.
