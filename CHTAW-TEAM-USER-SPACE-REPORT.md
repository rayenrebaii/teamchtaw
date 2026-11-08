# Espace étudiant Chtaw Team — Rapport de réalisation

Date : 5 novembre 2026.

## Résultat et dernière demande

L’espace étudiant conserve les conversations existantes et propose quatre destinations : Conversations, Présences, Mon profil et Paramètres.

Conformément à la dernière demande, la page Mes présences affiche uniquement :

- Les quatre KPI personnels.
- Les prochaines séances planifiées pour l’étudiant.
- Les absences officiellement enregistrées.

Les onglets, dates de filtrage, sélecteurs de statut/groupe et tri visibles ont été retirés. Aucune liste détaillée de présences ou de statuts en attente n’est ajoutée. Chaque liste conserve seulement une pagination indépendante lorsque nécessaire.

## Routes et API

- Ajout : /app/attendance, sous le layout utilisateur protégé existant.
- Conservation : /app, /app/groups/[groupId], /app/profile, /app/settings.
- Réutilisation : GET /api/v1/attendance/me. L’identité vient de l’acteur authentifié, sans paramètre arbitraire userId.
- Ajout de champs de réponse : items, stats, total, page, limit, timeZone, groups et incompleteSchedules. Le contrat historique sessions/presences/absences/alerts est conservé pour les consommateurs existants.
- Les filtres serveur validés restent disponibles, mais ne sont pas présentés dans la nouvelle interface simplifiée.

Les comptes non approuvés restent bloqués par les gardes existants. Les routes de consultation d’un autre étudiant et les mutations de présences restent réservées aux administrateurs. Un userId inconnu dans la query personnelle est refusé en HTTP 400 ; les tentatives d’accès ou de modification non autorisées sont refusées en HTTP 403.

## Navigation et responsive

La sidebar étudiant possède exactement quatre liens principaux. Les contrôles redondants d’installation et de thème sont retirés de sa partie basse ; ils restent disponibles dans Paramètres. Le menu utilisateur supérieur conserve le profil, les paramètres et la déconnexion.

Sur smartphone, les mêmes destinations sont affichées dans une grille de quatre colonnes en bas de l’espace plein écran, avec libellés lisibles et indication de la page active. La barre réserve sa hauteur dans le layout et tient compte de safe-area-inset-bottom. Le haut tient compte de safe-area-inset-top.

La hauteur de l’espace étudiant suit visualViewport lorsqu’il est disponible, avec repli sur innerHeight. La zone de conversation et les messages peuvent se réduire ; le compositeur reste dans la zone disponible. Le retour vers la liste des conversations est conservé. Les cartes, KPI et textes longs possèdent des règles adaptées aux petites largeurs.

La navigation administrateur et ses permissions sont conservées. La préférence anglaise d’un étudiant ne traduit pas les écrans administrateur.

## Calcul des présences

La source reste le modèle existant Poll de type SESSION, ses PollOption, votes, participants et pointages. Aucune table ni migration n’est créée.

- À venir : les créneaux concernés ont des dates connues et le premier commence après l’instant courant. Une validation future erronée ne transforme pas cette séance en absence affichée.
- Présent : validation officielle PRESENT, hors séance annulée ou encore future.
- Absent : validation officielle ABSENT selon les règles historiques ou obligatoires existantes, hors annulation ou séance future.
- En attente : absence de validation définitive ; aucun statut inconnu n’est transformé automatiquement en absence.
- Annulée : vraie annulation métier, exclue des statistiques.
- Non concerné : participant exclu, absent de la projection personnelle.

Les séances terminées sont comptées seulement lorsque tous les horaires de début et de fin sont connus et que la dernière fin est passée. Quand une heure de fin manque, elle n’est pas déduite du début, de la date limite de vote ou de la création du sondage. Les KPI de présence et d’absence restent fondés sur les validations officielles ; ils ne constituent donc pas nécessairement une partition du KPI des séances terminées lorsque des horaires anciens sont incomplets.

Pour les séances historiques à choix, les créneaux effectivement choisis sont utilisés lorsqu’ils existent. Pour les séances obligatoires, les créneaux de la séance et le participant concerné restent la référence.

Les prochaines séances sont triées en ordre chronologique croissant ; les absences en ordre décroissant. Les listes sont chargées séparément pour ne pas masquer des absences lorsqu’un étudiant possède de nombreuses séances futures.

Les instants ISO sont comparés comme des dates/heures absolues. L’affichage utilise le fuseau du navigateur ; le serveur accepte un fuseau IANA validé, avec Africa/Tunis comme valeur par défaut. Les filtres de jours encore disponibles dans l’API sont appliqués dans ce fuseau.

Les droits historiques existants sont préservés : un étudiant peut conserver son propre historique enregistré après un retrait de groupe. La nouvelle projection n’affiche pas les futures séances d’un groupe quitté. Aucun droit d’accès aux conversations de ce groupe ni aux présences d’un autre utilisateur n’est accordé.

## Profil

Le profil affiche avatar/initiales, nom, prénom, email, rôle, statut d’adhésion, inscription et groupes réels. Seuls le prénom, le nom et la présentation restent modifiables, via le service existant. Aucun contrôle de modification du rôle, du statut ou des groupes n’est ajouté.

L’étudiant rejoint sa nouvelle page personnelle depuis le lien d’historique. Le parcours d’historique administrateur existant est conservé.

## Préférences et traductions

- Thèmes clair, sombre et système, appliqués immédiatement et conservés dans chtaw-theme.
- Changement du thème système suivi via prefers-color-scheme, sans remplacer la préférence system enregistrée.
- Langue FR/EN conservée dans chtaw-language, français par défaut.
- Script initial dans le head appliquant thème et langue avant l’affichage du corps ; tests du script sans DOM réel. Le contrôle visuel d’un éventuel flash reste à effectuer dans un navigateur.
- Synchronisation des préférences entre onglets via les événements storage.
- Dictionnaire typé, sans service externe de traduction.
- Navigation, conversations, sondages affichés, profil, paramètres, présences, modales, états de chargement, erreurs et notifications de l’espace étudiant traduits.
- Noms de groupes, contenus des séances, créneaux et messages sauvegardés conservés tels quels.
- Pour un message d’erreur serveur non reconnu en anglais, une erreur générique anglaise est affichée ; les textes utilisateur ne sont pas traduits automatiquement.
- Les écrans d’administration restent en français. Les écrans d’authentification existants ne font pas l’objet d’une refonte de traduction.

Les préférences ne contiennent ni conversations, ni jetons, ni données de présence.

## Installation PWA

Le mécanisme existant est réutilisé. Le bouton des paramètres utilise le prompt disponible sur les navigateurs compatibles ; sinon, il affiche les instructions Android et Safari iOS.

Le mode standalone, le drapeau standalone Safari et l’événement appinstalled permettent l’affichage Application installée. Une simple acceptation du prompt ne provoque aucune fausse confirmation.

Le cache, les stratégies d’authentification et les règles d’accès aux conversations ne sont pas refondus dans cette mission. Les fonctions métier continuent de nécessiter le serveur.

## Tests exécutés

| Contrôle | Résultat |
| --- | --- |
| PWA : tests unitaires, préférences et Service Worker | 75/75 |
| PWA : tests DOM d’interface, dont espace étudiant | 25/25 |
| Backend : tests unitaires | 59/59 |
| Backend : intégrations HTTP/PostgreSQL/Socket.IO | 59/59 |
| Frontend : services/store vers API/PostgreSQL/Socket.IO réels | 14/14 |
| TypeScript PWA et backend | Réussite |
| Lint PWA et backend | Réussite |
| Compilation PWA et backend | Réussite |

Total des tests réussis dans ces suites : 232.

Les tests couvrent les séances futures du jour et des jours suivants, les passages de mois et d’année, les offsets ISO, le changement d’heure européen, les dates manquantes, les heures de fin manquantes, les validations officielles, les annulations, les séances à choix, la déduplication et la pagination.

Les intégrations vérifient l’identité personnelle, l’interdiction d’un autre userId, l’interdiction de modification par un étudiant, les filtres serveur, les fuseaux invalides et les séances d’un groupe quitté.

Les tests DOM vérifient l’absence des filtres et onglets, les deux listes utiles, les erreurs et retries, les états vides, la pagination indépendante, les traductions sans modification du contenu réel, le profil, la persistance des préférences, le thème système, le statut standalone et les instructions d’installation.

Le contrat DOM de navigation est testé avec des largeurs simulées de 320, 375, 390, 430, 768 et 1440 px. Les événements visualViewport sont simulés. Ces tests ne mesurent pas un rendu visuel, un débordement réel ou un clavier physique.

La base métier n’a pas été réinitialisée et aucune migration, seed ou suppression métier n’a été exécuté. Les intégrations utilisent les lanceurs créant leurs propres bases aléatoires ; les données de test sont conservées pour inspection.

## Fichiers modifiés

PWA :

- src/app/(user)/app/attendance/page.tsx
- src/app/{layout,loading,error,not-found}.tsx
- src/components/{shell,account-screen,providers,user-menu,shared,private-image}.tsx
- src/components/{student-attendance,student-space.ui.test,preference-effects}.tsx
- src/components/chat/{chat-screen,group-members}.tsx
- src/components/polls/poll-card.tsx
- src/components/pwa/{InstallPWAButton,updates}.tsx
- src/components/ui/dialog.tsx
- src/components/admin/attendance-roster.test.ts : adaptation du double de test au contrat Zustand utilisé par les traductions, sans modification du comportement testé
- src/services/attendance.service.ts
- src/stores/{community,preferences}.ts
- src/lib/{i18n,preference-bootstrap,preferences.test}.ts
- src/styles/globals.css
- README.md

Backend :

- src/polls/{attendance.controller,attendance.dto,attendance.service,personal-attendance}.ts
- test/{personal-attendance.spec,corrections.integration}.ts
- README.md

Racine : ce rapport. Les artefacts habituels de compilation sont régénérés ; aucune nouvelle dépendance n’est nécessaire.

## Limites restantes

Le connecteur de navigateur indique Browser access host is unavailable. Aucun contrôle visuel en navigateur, aucune mesure réelle d’absence de débordement, aucune utilisation d’un clavier mobile physique et aucune installation Android/iOS ne sont déclarés réalisés.

L’affichage réel aux six largeurs demandées, les safe areas et le comportement du clavier sont à contrôler sur appareils ou navigateur connecté. Les tests DOM et de viewport simulé donnent une couverture fonctionnelle, pas une certification visuelle.

Les horaires anciens incomplets sont affichés honnêtement : aucune date ou fin n’est inventée. Une correction éventuelle des données doit passer par les règles administrateur existantes.

Pour préserver les clients existants, l’endpoint conserve ses champs d’historique en plus des nouvelles listes paginées. La projection et les statistiques sont calculées à partir de l’historique personnel chargé côté serveur ; une optimisation SQL dédiée pourra être nécessaire pour des historiques très volumineux.

Les avertissements pg existants sur des requêtes concurrentes dans une transaction ne sont pas présentés comme corrigés. Les exigences d’hébergement, HTTPS et validation physique PWA du rapport précédent restent applicables.
