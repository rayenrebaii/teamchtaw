# Chtaw Team — Notifications

Validation du 5 novembre 2026. Périmètre : application Next.js dans `chtaw-team-pwa` et API NestJS dans `chtaw-team-backend`.

## Résultat et état de configuration

Le centre interne, les préférences persistantes, les notifications de messages/sondages, les rappels étudiants et les invalidations Socket.IO sont implémentés et testés. Le transport Web Push et les événements du Service Worker sont implémentés. La réception d’une notification système sur un véritable téléphone reste à vérifier : les clés VAPID ne sont pas configurées dans l’environnement local.

L’absence de VAPID désactive explicitement le Push, sans désactiver l’historique interne. Aucune permission navigateur n’est demandée au chargement.

## Architecture

1. Une insertion de message crée une entrée transactionnelle dans `NotificationEvent`. Le trigger prend un instantané des membres approuvés et de leurs préférences au moment de la publication. Les messages système et l’expéditeur sont exclus.
2. Le worker consomme cet outbox après commit. Il recontrôle le statut, le groupe et les préférences avant de créer les notifications. Un message de type poll produit uniquement une notification POLL.
3. L’unicité `Notification(userId, sourceKey)`, les verrous PostgreSQL et les transactions empêchent les doublons de notifications. Les votes et modifications d’un sondage n’ajoutent aucun événement de publication.
4. PostgreSQL LISTEN/NOTIFY diffuse une invalidation par utilisateur à chaque instance. Socket.IO émet `notification:changed` uniquement dans sa room `user:<id>`, après nouvelle vérification de session. Le payload ne contient aucune donnée privée.
5. Le client recharge l’historique et le compteur ; il se resynchronise aussi au retour réseau, au focus, à la reconnexion Socket et toutes les 15 secondes. Les réponses d’un ancien compte ou d’une ancienne requête sont ignorées.
6. Les envois système disposent d’une file séparée `PushDelivery`. Un échec Push ne supprime jamais la notification interne.

## Modèles et migration

Migration additive : `chtaw-team-backend/prisma/migrations/202611050002_notifications/migration.sql`.

| Modèle | Utilité |
|---|---|
| Notification | Historique individuel, type, groupe, cible, lecture, clé de déduplication |
| NotificationPreference | Activation globale, messages, sondages, rappels |
| NotificationEvent | Outbox persistant avec destinataires de publication |
| PushSubscription | Appareil, session, endpoint, clés et nonce de liaison |
| PushDelivery | File de transport avec tentative, bail, prochaine échéance et résultat |
| SessionReminderDelivery | Échéance et résultat du rappel pour un étudiant/créneau/date |

Ajout de `PollOption.notificationUpdatedAt` pour suivre la création et la reprogrammation. Les cibles de notifications sont des références souples : un contenu supprimé retourne « indisponible », sans inventer une cible.

La migration a été appliquée sur plusieurs bases neuves de test, puis sur la base locale de l’application avec `scripts/migrate-notifications.mjs`. Comparaison avant/après : **17 tables métier, 44 lignes existantes, contenus inchangés** ; la nouvelle colonne est exclue de cette comparaison. Aucun reset, aucun seed et aucun effacement des données existantes. Les anciens messages ne sont pas notifiés rétroactivement.

## Rappels

- Réservés aux comptes USER approuvés encore membres du groupe.
- Dates UTC stockées : début réel du créneau moins 24 h, puis moins 1 h. La clôture du vote n’est jamais utilisée comme début.
- Texte horaire dans `NOTIFICATION_TIMEZONE`, par défaut Africa/Tunis.
- Séances obligatoires : participants inclus dans la liste persistante de la séance. Séances historiques : uniquement les créneaux effectivement choisis par vote.
- Échéances stockées en PostgreSQL, traitées toutes les 15 secondes. Un redémarrage conserve les échéances, sans timer individuel en mémoire.
- Unicité créneau/utilisateur/type/date de début. Deux workers concurrents ne créent qu’une notification.
- Reprogrammation : annulation des anciens jobs en attente et calcul des nouvelles dates.
- Séance annulée, début dépassé, compte refusé, retrait du groupe ou participant exclu : aucun nouveau rappel.
- Création tardive : les rappels déjà échus sont SKIPPED, notamment le rappel « demain ». Le rappel 1 h futur reste planifié.
- À l’exécution, une échéance existante retardée de plus de 15 minutes est ignorée pour éviter un rappel trompeur. Le minuteur de traitement ne garantit pas une livraison système à la seconde près.
- SENT dans SessionReminderDelivery signifie « notification interne enregistrée », pas « téléphone ayant affiché le Push ».

## API et sécurité

Routes sous `/api/v1/notifications` :

- GET historique paginé, compteur et filtre unread.
- GET/PATCH preferences.
- GET push-config : activation et clé publique uniquement.
- GET subscriptions : identifiants/nonces de cette session uniquement.
- POST subscriptions ; DELETE subscriptions/:id.
- PATCH read-all ; PATCH :id/read.
- GET :id/target : résolution autorisée vers message, sondage ou séance.

Toutes les routes exigent la session existante et un compte approuvé. Un utilisateur ne peut ni lire une notification étrangère, ni changer ses destinataires, ni supprimer l’abonnement d’une autre session. Les administrateurs ne peuvent pas activer des rappels personnels via le DTO. Les réponses sont `Cache-Control: private, no-store`.

Les endpoints Push sont validés : HTTPS, aucun identifiant dans l’URL, aucun port alternatif, aucune IP/localhost, fournisseurs reconnus ou origine explicitement configurée côté serveur. Les clés d’abonnement sont validées et ne sont pas retournées dans les listes.

La déconnexion révoque la session et supprime ses abonnements serveur. Le client invalide aussi sa liaison IndexedDB, ferme les notifications affichées et avertit le Service Worker. Un nonce par abonnement empêche une notification en transit pour l’ancien compte de s’afficher pour le suivant. Aucun JWT n’est ajouté à IndexedDB ; les jetons d’accès restent dans le mécanisme mémoire existant.

## Transport Push et Service Worker

Utilisation de `web-push` avec VAPID et chiffrement aes128gcm. La file prend un bail PostgreSQL avec FOR UPDATE SKIP LOCKED ; les échecs transitoires sont retentés avec temporisation croissante, au maximum cinq tentatives. Une réponse 404/410 retire l’abonnement expiré. Sessions révoquées, notifications déjà lues, expirées ou devenues inaccessibles ne sont pas envoyées.

Le contenu système est volontairement générique : « Une nouvelle notification est disponible dans votre espace. » Aucun texte de conversation ni nom de groupe privé dans le payload ou l’écran verrouillé.

Le Service Worker conserve ses stratégies de cache public et sa page hors ligne. Cache passé à v6. Il gère push, notificationclick et UNBIND_PUSH. Le clic ouvre une route interne fixe, puis la PWA demande au serveur la cible autorisée après restauration de session.

L’unicité en base est garantie par les transactions/contraintes. La livraison externe reste best effort : un service Push peut accepter un envoi dont l’accusé de réception se perd. Le tag de notification limite les doublons visuels, sans promettre un transport externe exactement une fois.

## Interface

Cloche et badge dans le header des deux rôles, panneau responsive, page complète `/app/notifications`, actions lire/tout lire et pagination. Le header conserve logo et texte TEAM CHTAW ; l’avatar montre uniquement les initiales dynamiques.

Dans Paramètres : activation globale, messages, sondages et autorisation explicite de l’appareil. Les étudiants disposent également du contrôle commun aux deux rappels. L’historique n’est pas supprimé lors d’une désactivation.

L’état « actif sur cet appareil » vérifie la permission, le Service Worker, l’abonnement navigateur et sa liaison à la session serveur. Les états refusé, incompatible, non configuré et erreur sont affichés. Une réinstallation ou un changement de compte demande une nouvelle activation de l’appareil.

## Fichiers

- Backend : `src/notifications/*`, `prisma/schema.prisma`, migration ci-dessus ; `app.module.ts`, `common/events.ts`, `bootstrap.ts`, `auth/auth.service.ts`, `realtime/realtime.module.ts`, `config/environment.ts`.
- Navigation des cibles : DTO et filtre personnels dans `src/polls/attendance.dto.ts` et `personal-attendance.ts`.
- PWA : `components/notifications/*`, `stores/notifications.ts`, `services/notifications.service.ts`, pages notifications et sessions, `providers.tsx`, `shell.tsx`, `account-screen.tsx`, `community.ts`, `realtime.service.ts`, `i18n.ts`, `globals.css`, `public/sw.js`, `pwa.service.ts`, page groupe et ChatScreen pour les liens ciblés.
- Tests : `test/notifications.spec.ts`, `test/notifications.integration.ts`, tests store/Service Worker/notifications UI et `test/browser/navigation.spec.ts`.
- Dépendances/lockfiles, `.env.example`, `PRODUCTION.md`, scripts de diagnostic et migration.

## Validation exécutée

| Contrôle | Résultat |
|---|---|
| Backend TypeScript, lint, build | Réussis |
| Backend tests unitaires | 80/80 |
| Backend tests intégration PostgreSQL/Socket.IO | 80/80, dont 21 nouveaux scénarios |
| PWA TypeScript, lint, build | Réussis |
| PWA tests Node | 85/85 |
| PWA tests UI jsdom | 38/38 |
| Services PWA contre API réelle sur base neuve | 14/14 |
| Edge : responsive, header, navigation et paramètres | 13/13 |
| npm audit --omit=dev backend et PWA | 0 vulnérabilité signalée |

Les tests couvrent les destinataires, exclusions, préférences, compteur, lecture, cibles, isolation entre comptes, rooms Socket.IO réelles, événement API traité automatiquement, rappels 24 h/1 h, annulation, reprogrammation, création tardive, deux workers simultanés, transport simulé, retry et abonnement expiré. Un test construit un véritable payload Web Push chiffré sans contacter un service externe. Les événements Push et clic du Service Worker sont exécutés dans un environnement de test.

Les tests visuels Edge utilisent des réponses API contrôlées ; les règles métier sont testées séparément contre le vrai backend/PostgreSQL isolés. Ils ne constituent pas une réception Push réelle.

## À configurer et vérifier avant publication

1. Configurer ensemble VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT avec un contact réel. La validation serveur refuse une configuration partielle ou une paire incohérente. Ne jamais mettre la clé privée dans NEXT_PUBLIC/VITE.
2. Déployer migrations avant démarrage, HTTPS, proxy API/WebSocket, PostgreSQL persistant et sorties HTTPS vers les services Push.
3. Tester sur appareils : permission acceptée/refusée, application en arrière-plan/fermée, abonnement expiré, déconnexion, partage d’appareil, réinstallation et mise à jour de la PWA.
4. Android Chrome et iOS Safari ne sont pas validés physiquement ici. Sur iOS/iPadOS compatibles, Web Push concerne les applications ajoutées à l’écran d’accueil et exige une action de l’utilisateur. Références : [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [web-push](https://github.com/web-push-libs/web-push).
5. Les fonctions métier restent connectées au serveur. Aucun envoi de message, vote ou pointage hors ligne n’est promis.

Avertissement non bloquant observé : dépréciation pg pour certaines requêtes concurrentes dans les transactions existantes. Les dépendances d’outillage conservent des alertes précédemment documentées ; le résultat d’audit ci-dessus concerne uniquement la production. Aucun audit fix --force.
