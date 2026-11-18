# Dashboard analytique Chtaw Team

La page `/admin` utilise trois endpoints protégés par les contrôles administrateur
existants : `/admin/analytics`, `/admin/analytics/sessions` et
`/admin/analytics/alerts`. Les requêtes sont paramétrées. Chaque réponse est
calculée côté PostgreSQL dans une transaction de lecture cohérente
(`RepeatableRead`). Aucun utilisateur, vote ou pointage individuel n’est envoyé
au navigateur pour calculer les graphiques.

## Fonctionnalités

- Cinq cartes : utilisateurs avec approuvés/en attente, groupes, séances
  effectuées, présences et taux de présence.
- Courbe des inscriptions par jour, semaine ou mois, nouvelles ou cumulées,
  périodes à zéro, valeurs exactes au survol et navigation au clavier.
- Deux barres distinctes par groupe et par séance, taux/effectifs au survol,
  informations également visibles sur téléphone. Le groupe filtre les analyses ;
  les séances ouvrent le détail de présence existant.
- Signalements actifs issus du mécanisme existant, avec accès au détail.
- Listes paginées : huit séances, cinq signalements ; six groupes par écran
  pour l’histogramme, sur les seuls agrégats transmis par le serveur.
- Filtres de période/groupe, réinitialisation et actualisation, états de
  chargement/erreur/vide, français/anglais et thèmes clair/sombre conservés.
- Le chargement de session sur le dashboard et à l’entrée administrateur
  n’effectue plus le téléchargement intégral des comptes et sondages. Les autres
  pages retrouvent leur chargement habituel lors de la navigation.

## Définitions

Les utilisateurs et groupes sont les effectifs actuels. Les comptes retirés des
agents administratifs sont exclus. Le total utilisateurs couvre les rôles et
statuts existants ; approuvés et en attente sont explicités. Dans un groupe, il
s’agit des membres actuels, et non d’une reconstruction de ses effectifs passés.

Une séance effectuée est un sondage `SESSION` non annulé, dont tous les créneaux
possèdent une fin passée, selon `sessionFinished`. Sa date de rattachement est le
début du premier créneau. Les archives conservées sont incluses ; les données
définitivement supprimées et les horaires incomplets ne sont pas inventés.

Une participation globale est un couple étudiant/séance, dédupliqué même lorsque
la séance possède plusieurs créneaux ou plusieurs groupes. Une présence à un
créneau valide suffit. Pour le suivi obligatoire, l’exclusion du participant et
la confirmation explicite de l’absence sont respectées ; un pointage incomplet
reste en attente. Pour le suivi historique, les sélections sont regroupées selon
la priorité présence, absence lorsque toutes les sélections valides sont
absentes, puis pointage incomplet. Les créneaux valides reprennent la validation
ou le début passé, avec la date d’archive comme référence des archives. Les
votes des administrateurs/collaborateurs ne comptent pas comme présences.

Le taux est `présences / (présences + absences confirmées) × 100`, arrondi à une
décimale. Les pointages incomplets n’entrent pas dans ce dénominateur. Sans
dénominateur, l’API retourne `null` et l’interface affiche « — ».

Une séance partagée appartient à tous ses groupes liés, conformément à son
audience existante. Ses participations apparaissent donc dans chaque barre de
groupe, même pour un participant membre d’un seul de ces groupes. Ces barres ne
peuvent pas s’additionner. Les totaux globaux restent dédupliqués. Aucun historique
d’appartenance individuel par groupe n’est disponible pour modifier cette
attribution rétrospectivement.

Les inscriptions suivent `User.joinedAt`. Le cumul inclut les comptes conservés
créés avant la borne initiale. Une semaine commence le lundi. Les regroupements
partiels de début/fin sont limités à la période. Les comptes définitivement
supprimés ne sont pas reconstructibles : cette limite est affichée. Le filtre
de groupe utilise les appartenances actuelles, jamais leur date d’adhésion.

Les alertes reprennent `OrganizerAbsenceAlert` non résolu et
`OrganizerAbsenceState.total >= 3`, sur tout l’historique. Le groupe filtre les
relations de séances stockées dans l’alerte. La période des graphiques n’altère
ni le seuil, ni le compteur, ni la résolution des signalements.

Le fuseau est `NOTIFICATION_TIMEZONE`, ou `Africa/Tunis`. Les bornes sont des
dates locales inclusives, traduites en bornes UTC avec minuit suivant exclusif.
Par défaut : mois courant et tous les groupes. « Trois derniers mois » va de la
même date trois mois auparavant (ajustée en fin de mois) à aujourd’hui. La
période personnalisée est limitée à cinq ans pour borner le volume des séries.

## Validation

- Backend : 232 tests unitaires réussis ; compilation et TypeScript réussis.
- PostgreSQL Docker jetable : neuf scénarios HTTP réussis via
  `npm run test:isolated -- --analytics`. Connexions normales avec identités de
  test uniquement ; aucune base existante ni aucun identifiant de production.
- Les scénarios couvrent les séances multiples/partagées, les pointages
  incomplets, annulations, archives, dates locales, séries sans inscription,
  cumuls antérieurs, suppressions définitives, autorisations et paginations.
- Frontend : 116 tests unitaires et 208 tests UI réussis, dont les filtres,
  cumuls, états vides/erreurs, traductions, détails, paginations et chargement
  léger ; TypeScript, build et lint réussis. Le lint ciblé du nouveau code
  backend est également réussi.
- Huit scénarios Playwright : 320, 390, 768 et 1440 px, en clair/français et
  sombre/anglais. Captures contrôlées du haut de page, des graphiques et des
  alertes. Les réponses déterministes utilisées pour ces seuls tests ne sont
  jamais importées par le dashboard livré.
- Le lint global du backend révèle deux erreurs préexistantes hors de cette
  refonte : import `require()` dans `test/security-rotation.emulator.ts:33` et
  argument inutilisé `firstOnly` dans `test/session-audit.integration.ts:40`.

Commandes principales : `npm test` dans chaque projet, `npm run build:local`,
`node scripts/safe-command.mjs backend:typecheck`, `backend:lint`, puis depuis la
PWA `node ../chtaw-team-backend/scripts/safe-command.mjs pwa:lint` et
`pwa:analytics:browser` avec la prévisualisation locale dédiée.

Aucune nouvelle migration ni dépendance n’est nécessaire pour cette refonte.
Les règles de présence, les autorisations de pointage et les identités restent
inchangées. Aucun déploiement ni accès à la production n’a été effectué.
