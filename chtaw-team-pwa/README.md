# Team Chtaw — PWA connectée au backend

La PWA Next.js utilise maintenant l’API NestJS et PostgreSQL. Les pages, le design, le responsive, les modes clair/sombre et les fonctions PWA sont conservés. Le site vitrine et le dossier Application restent inchangés. Aucun Supabase, déploiement ou publication GitHub.

## Démarrage

Node.js 22.13+ ou 24 recommandé, npm et Docker Desktop actif. Depuis le dossier backend, dans un terminal :

```powershell
cd chtaw-team-backend
npm.cmd ci
node scripts/setup-local.mjs
npm.cmd run prisma:generate
docker compose -p chtaw-team-backend up -d --wait postgres
npm.cmd run db:migrate
```

Renseigner son email administrateur et un mot de passe de 16 à 128 caractères dans les variables SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD du .env backend, puis :

```powershell
npm.cmd run db:seed
npm.cmd run dev
```

L’API écoute sur http://127.0.0.1:3002/api/v1 et Swagger sur http://127.0.0.1:3002/docs. Le seed ne réinitialise pas un admin existant et ne transforme jamais un compte public en administrateur.

Dans un autre terminal, depuis la racine du workspace :

```powershell
cd chtaw-team-pwa
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Préserver un .env.local existant. Ouvrir http://127.0.0.1:3001. Sur macOS/Linux, utiliser npm au lieu de npm.cmd et cp au lieu de Copy-Item.

Pour la version compilée : npm.cmd run build puis npm.cmd start dans chaque projet. Les API de session nécessitent un backend disponible ; la PWA n’invente aucune donnée en cas d’erreur réseau.

## Configuration

| Projet   | Variable                                            | Valeur locale                                         |
| -------- | --------------------------------------------------- | ----------------------------------------------------- |
| Frontend | NEXT_PUBLIC_API_URL                                 | http://127.0.0.1:3002/api/v1                          |
| Frontend | NEXT_PUBLIC_SOCKET_URL                              | http://127.0.0.1:3002                                 |
| Backend  | CORS_ORIGINS                                        | http://127.0.0.1:3001,http://localhost:3001           |
| Backend  | REFRESH_COOKIE_SAMESITE                             | lax                                                   |
| Backend  | DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET | Fichier .env privé, généré et validé côté backend     |
| Backend  | SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD               | Credentials du premier admin, uniquement pour le seed |

Aucun secret dans NEXT_PUBLIC_*. Ces URLs sont intégrées au build Next.js : reconstruire après un changement. Utiliser le **même hôte** pour les deux projets : 127.0.0.1 et localhost ne partagent pas les cookies. Les autres variables backend sont détaillées dans son README et .env.example.

En production, configurer HTTPS pour les deux services et NODE_ENV=production pour le backend. Le cookie devient Secure. Préférer un hébergement sur le même site ; SameSite=None nécessite HTTPS et reste soumis aux restrictions de cookies tiers du navigateur.

## Fonctionnalités réellement connectées

- Inscription réelle, validation des champs, connexion et redirection selon le rôle/statut. L’inscription est suivie d’une connexion pour afficher la demande en attente.
- Statut d’attente actualisé par Socket.IO et par interrogation de secours toutes les 15 secondes lorsque l’onglet est visible.
- Approbation/refus admin, ajout automatique au général et droits exclusivement décidés par le backend.
- Liste, création, modification et suppression des groupes, affectations/retraits et déplacement atomique entre groupes.
- Messagerie HTTP avec réception Socket.IO, historique par curseur, chargement des messages précédents, déduplication par ID et rattrapage des pages manquées après reconnexion.
- Erreurs d’envoi visibles ; le texte reste dans le champ tant que le serveur n’a pas confirmé. Les boutons d’envoi et de vote sont désactivés pendant leur requête.
- Photos admin en multipart, aperçu Blob, progression XHR, validation format/taille, images privées chargées avec Bearer puis affichées via URL Blob temporaire et révoquée au démontage.
- Galerie et agrandissement des photos de l’historique chargé ; le dialogue permet de charger d’autres pages.
- Sondages simples/multiples, clôture, vote unique géré en transaction par le backend, résultats actualisés par événements.
- Statistiques réelles depuis GET /admin/stats ; aucune estimation à partir des seuls messages chargés.
- Profil, déconnexion, thème et installation PWA.

Le transport navigateur ajoute un refresh token en cookie HttpOnly, SameSite et Secure en production. L’access token reste en mémoire, jamais dans localStorage ou sessionStorage. Après actualisation, la PWA renouvelle la session avec le cookie puis relit son utilisateur. Aucun mot de passe n’est persistant ; les champs mot de passe sont réinitialisés après soumission.

Les refresh concurrents sont regroupés dans un même onglet et sérialisés entre onglets avec Web Locks lorsque disponible. BroadcastChannel signale une connexion/déconnexion aux autres onglets sans transmettre de token. Un profil de navigateur correspond à une session cookie : pour tester admin et membre simultanément, utiliser deux profils/contextes de navigateur ou une fenêtre privée. Sur les anciens navigateurs sans Web Locks, éviter les renouvellements simultanés entre onglets ; le backend révoque volontairement une session en cas de rejeu d’un ancien refresh token.

Une erreur 401 tente un seul renouvellement avant de rejouer la requête ; une erreur 403 conserve la session et affiche le refus. La déconnexion vide immédiatement les données privées en mémoire, marque la session comme fermée localement et tente la révocation par cookie. Une panne réseau n’autorise pas la restauration automatique du cookie ; la révocation est retentée au retour du réseau. Les pannes réseau n’effacent pas artificiellement le compte et ne déclenchent pas un passage au mode démo.

## Architecture

```text
src/
├── services/
│   ├── api-client.ts          # erreurs, Bearer en mémoire, cookies, refresh sérialisé
│   ├── auth.service.ts
│   ├── users.service.ts       # membres, approbations, profil, statistiques
│   ├── groups.service.ts
│   ├── messages.service.ts
│   ├── polls.service.ts
│   ├── uploads.service.ts     # XHR avec progression, fallback fetch pour les tests Node
│   └── realtime.service.ts    # namespace /community et cycle de reconnexion
├── stores/community.ts       # état réel sans persist ni seed
├── hooks/use-image-preview.ts
├── components/private-image.tsx
├── components/               # design et composants existants raccordés aux actions async
└── types/                    # modèles communs et résumé d’auteur
```

Les anciens fichiers demo.ts, mock-community.ts, mocks/seed.ts et les règles de démonstration sont conservés pour les tests historiques, mais **aucune page ne les importe**. Aucun bouton ni mode démo n’est activé en production ou par défaut. Les données PostgreSQL ne sont jamais mélangées aux anciennes données locales. Les préférences de thème et de langue ainsi qu’un indicateur de déconnexion sans données privées utilisent localStorage. Aucun jeton ni message n’y est conservé.

Les services ciblent uniquement les endpoints existants du backend. Les identifiants sont ceux de PostgreSQL ; le général est découvert par isGeneral. La création d’un groupe et la publication de son image sont séparées, de façon à conserver l’ID réellement créé si le téléversement échoue. Conformément à l’API existante, l’image de groupe est aussi publiée comme photo dans sa conversation.

## Temps réel

Le client rejoint le namespace /community avec l’access token en auth.token, sans token dans une URL. Il rejoint les groupes autorisés et gère message:created, poll:created, poll:updated, group:updated, group:removed, group:member-added, group:member-removed et user:reviewed.

Lors d’une reconnexion, il recharge les droits et les sondages, rejoint les salons et remonte l’historique jusqu’à un message déjà connu. La déduplication s’applique aux réponses HTTP et événements. Un retrait efface immédiatement le groupe, son historique et ses sondages du store ; le serveur contrôle aussi chaque accès et retire les sockets de ses salons. Après expiration de l’access token, le client renouvelle sa session puis reconnecte la socket.

## PWA et confidentialité

Le manifest, les icônes 192/512, maskable et Apple, les safe areas et le bouton d’installation sont conservés. Le service worker est enregistré uniquement en production ; le cache public est versionné en v5. Il ne cache aucun HTML de navigation, aucune API, ni aucune réponse no-store ou privée. Hors ligne, la navigation affiche uniquement la page publique de déconnexion réseau. Les anciennes versions sont nettoyées ; les mises à jour attendent une confirmation avant rechargement.

Les conversations nécessitent une connexion. Aucun contenu privé n’est conservé pour un fonctionnement hors ligne, aucun envoi n’est mis en file et aucune notification push n’est implémentée. L’installation Android/iOS dépend du navigateur ; Safari iOS affiche les instructions via Partager. Pour tester localement le service worker : build puis start.

## Vérifications

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests d’intégration réels depuis le dossier backend :

```powershell
npm.cmd run test:isolated
npm.cmd run test:frontend:isolated
```

Chaque commande crée une base neuve `chtaw_test_<identifiant aléatoire>`, applique les migrations et exécute les tests sur cette base uniquement. L’utilisateur PostgreSQL doit disposer du droit CREATE DATABASE. Les bases sont conservées pour inspection et aucune base existante n’est réinitialisée. Le serveur frontend de test confirme par IPC son identité de base avant le démarrage des tests, puis est arrêté automatiquement.

La suite frontend utilise les vrais services, le store, Socket.IO, NestJS et PostgreSQL. Le harnais Node simule des contextes de cookies séparés ; il ne valide pas le rendu visuel ni les politiques de cookies d’un navigateur réel. `npm test` inclut aussi les tests d’interface jsdom.

## Pointage des présences

Le pointage admin s’ouvre sur `/admin/attendance/[sessionId]`, dans le layout protégé existant. Il utilise toute la largeur, un tableau sur ordinateur et les mêmes lignes sous forme de cartes sous 900 px. Le retour `/admin/attendance?pollId=…` conserve le filtre de séance ; `?slot=…` conserve le créneau sélectionné au rechargement. Les appels API, versions de correction et règles de présence sont inchangés.

Les modifications non enregistrées sont signalées avant un retour, une navigation par lien, une déconnexion, un rechargement ou une fermeture. Les tests d’interface DOM couvrent les créneaux, l’enregistrement, les erreurs et les corrections. Le rendu réel desktop/mobile et les confirmations natives du navigateur restent à contrôler manuellement lorsque l’outil navigateur est indisponible.

## Limites restantes

Aucun endpoint indispensable au raccordement demandé n’est manquant. Les notifications persistantes/push ne sont pas implémentées, et les anciens contrats de démonstration les mentionnant ne sont pas appelés.

Les listes de membres et sondages sont récupérées par pages puis réunies pour les filtres existants ; une interface admin paginée côté serveur sera préférable pour de grandes communautés. Le rate limiting et les événements backend restent mono-instance ; Redis et un outbox sont des évolutions documentées côté backend.

Il n’y a pas d’idempotence de publication hors ligne : aucune écriture n’est rejouée automatiquement après une erreur réseau ambiguë. Le cache privé, le stockage durable de messages côté appareil, les notifications push et la validation d’installation sur appareils Android/iOS restent hors de cette phase.
## Gestion des membres et production

La page /admin/users centralise les comptes, les demandes et les affectations. /admin/approvals redirige vers /admin/users?status=PENDING. Le dashboard est conservé sans entrée de navigation. Les décisions prises depuis cette version sont historisées ; les dates et auteurs des décisions antérieures ne sont pas inventés. Les affectations du groupe général sont automatiques et non modifiables, même par un administrateur.

Voir ../PRODUCTION.md et ../CHTAW-TEAM-CORRECTIONS-REPORT.md pour la configuration, les résultats réels et les limites des tests mobiles.


## Espace étudiant

La navigation utilisateur comporte Conversations, Présences, Mon profil et Paramètres. La page /app/attendance affiche seulement les KPI personnels, les séances à venir et les absences officiellement enregistrées. Les filtres et onglets initialement prévus ont été retirés à la demande de l’utilisateur.

L’interface étudiante propose FR/EN et des thèmes clair, sombre et système persistants. Les messages, noms de groupes et contenus de séances ne sont pas traduits. Le profil reste modifiable uniquement sur les champs déjà autorisés.

GET /api/v1/attendance/me est réutilisé : les champs items/stats paginés complètent le contrat historique existant. Les dates proviennent des créneaux, jamais de la création du sondage. Une séance sans heure de fin n’est pas automatiquement comptée comme terminée.

Voir ../CHTAW-TEAM-USER-SPACE-REPORT.md pour les tests exécutés et les limites des contrôles visuels et PWA.
