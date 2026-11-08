# Team Chtaw — Backend NestJS

Backend NestJS 11, TypeScript strict, PostgreSQL 17, Prisma 7 avec adaptateur `pg`, Passport/JWT, Argon2id, Socket.IO, validation DTO et Swagger. La phase 3 raccorde maintenant `chtaw-team-pwa` à cette API. Aucun déploiement, aucune publication GitHub et aucun accès au site vitrine, au projet Barber ou aux configurations mobiles `profiles.approved` / `app_config`.

## Session navigateur — phase 3

La PWA envoie `X-Session-Transport: cookie` sur login, refresh et logout. Ce mode exige une origine explicitement autorisée dans `CORS_ORIGINS`. Le refresh token est placé dans un cookie **HttpOnly**, `SameSite=Lax` par défaut, limité au chemin `/api/v1/auth`, et n’est plus renvoyé dans le JSON. En production il utilise `Secure` et le préfixe `__Secure-`. Les réponses de session portent `Cache-Control: no-store`. Le frontend conserve l’access token uniquement en mémoire et utilise `credentials: include`.

`POST /auth/refresh` accepte donc `{}` en mode cookie ; il conserve le DTO `{refreshToken}` pour les clients utilisant le transport JSON historique. Le logout efface le cookie et révoque la session. Une origine absente ou étrangère est refusée pour le transport cookie, y compris si le navigateur possède un cookie valide. CORS autorise les credentials uniquement pour les origines configurées et l’en-tête de transport. Aucun refresh token n’est accepté depuis une URL.

Variable ajoutée : `REFRESH_COOKIE_SAMESITE=lax` (`lax`, `strict` ou `none`). `none` est réservé à la production HTTPS ; un hébergement frontend/API sur le même site reste préférable aux cookies tiers. Ne pas mélanger `localhost` et `127.0.0.1` : utiliser le même nom d’hôte pour les deux services.

Les messages incluent aussi un résumé `author` (ID, nom, prénom, rôle et bio, sans email ni hash) afin d’afficher correctement les auteurs d’un historique, même s’ils ont quitté le groupe.

La documentation du raccordement, des tests et des limites actuelles est dans le [README frontend](../chtaw-team-pwa/README.md) et le [rapport phase 3](VERIFICATION-PHASE3.md). Les sections ci-dessous décrivent également le transport JSON conservé pour les autres clients.

## Démarrer en local

Prérequis : Node.js 22.13+ ou 24 LTS, npm et Docker Desktop actif avec le moteur Linux. Node 24 a été utilisé pour les vérifications. Commandes PowerShell depuis ce dossier ; sur macOS/Linux, remplacer `npm.cmd` par `npm`.

```powershell
npm.cmd ci
node scripts/setup-local.mjs
npm.cmd run prisma:generate
docker compose -p chtaw-team-backend up -d --wait postgres
npm.cmd run db:migrate
```

`setup-local.mjs` crée `.env` avec un mot de passe PostgreSQL et deux secrets JWT aléatoires, sans les afficher. Il préserve tout `.env` existant. Un fichier local a déjà été généré pendant le développement ; il est ignoré par Git. Le port PostgreSQL `5434` est lié uniquement à `127.0.0.1`. Le volume `chtaw-team-backend_chtaw_pgdata` appartient à ce projet.

Renseigner dans `.env` **son propre email administrateur et un mot de passe de 16 à 128 caractères** : `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, et éventuellement les noms. Aucun identifiant administrateur fixe n’est livré. Puis :

```powershell
npm.cmd run db:seed
npm.cmd run dev
```

API : http://127.0.0.1:3002/api/v1 — Swagger : http://127.0.0.1:3002/docs — OpenAPI JSON : http://127.0.0.1:3002/docs-json.

Le seed crée le groupe général permanent, crée le premier admin approuvé et l’ajoute aux groupes. Il est idempotent, ne réinitialise aucun mot de passe et refuse de promouvoir un email qui appartient déjà à un compte public. Retirer `SEED_ADMIN_PASSWORD` de l’environnement après utilisation. Les nouveaux groupes incluent tous les admins approuvés ; ils ne peuvent pas être retirés par les endpoints de membres.

```powershell
npm.cmd run build
npm.cmd start
```

`dev` utilise ts-node pour conserver les métadonnées de décorateurs requises par l’injection NestJS. Arrêter avec Ctrl+C. Pour arrêter uniquement le PostgreSQL du projet : `docker compose -p chtaw-team-backend stop postgres`. Éviter `down -v` pour conserver les données.

## Variables d’environnement

Le fichier `.env.example` contient la liste complète ; aucune valeur de secret n’est nécessaire dans le code.

| Variable                                        | Usage / défaut                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `NODE_ENV`                                      | `development`, `test` ou `production`                                                |
| `HOST`, `PORT`                                  | Écoute API, `127.0.0.1:3002`                                                         |
| `DATABASE_URL`                                  | URL PostgreSQL ; le paramètre `schema` est pris en compte par Prisma et l’adaptateur |
| `POSTGRES_PASSWORD`                             | Initialisation du conteneur local ; cohérent avec `DATABASE_URL`                     |
| `CORS_ORIGINS`                                  | Liste d’origines exactes séparées par des virgules, sans `/` final ni wildcard       |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`       | Deux secrets distincts d’au moins 48 caractères                                      |
| `ACCESS_TTL_SECONDS`                            | Access token : 900 secondes, entre 60 et 3600                                        |
| `REFRESH_TTL_SECONDS`                           | Session glissante : 604800 secondes, entre 3600 et 2592000                           |
| `UPLOAD_DIR`                                    | Répertoire privé des fichiers ; défaut `./uploads`                                   |
| `UPLOAD_MAX_BYTES`                              | Taille maximale en octets, défaut 5 Mio, plafond 10 Mio                              |
| `SWAGGER_ENABLED`                               | `true` en développement ; désactivé par défaut en production                         |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`       | Uniquement pour le seed administrateur explicite                                     |
| `SEED_ADMIN_FIRST_NAME`, `SEED_ADMIN_LAST_NAME` | Noms du premier admin                                                                |
| `TEST_DATABASE_URL`                             | URL générée par les lanceurs de tests isolés ; ne pas utiliser la base métier         |

Changer `POSTGRES_PASSWORD` après l’initialisation d’un volume ne modifie pas le mot de passe déjà enregistré par PostgreSQL. Ne pas supprimer le volume pour une simple rotation : gérer les credentials PostgreSQL explicitement.

## Architecture

```text
chtaw-team-backend/
├── prisma/
│   ├── schema.prisma          # 10 modèles, enums, index et clés étrangères
│   ├── migrations/            # schéma initial + invariants SQL
│   └── seed.ts                # admin explicite, sans identifiants par défaut
├── scripts/                   # configuration locale et migrations de test
├── src/
│   ├── auth/                  # JWT, Passport, rotation et révocation
│   ├── users/                 # profil, recherche, filtres et statistiques admin
│   ├── approvals/             # décision et affectation générale transactionnelles
│   ├── groups/                # groupes, appartenance, déplacement atomique
│   ├── messages/              # texte et historique paginé
│   ├── uploads/               # validation, réencodage et stockage privé injectable
│   ├── polls/                 # création, résultats et participation atomique
│   ├── realtime/              # namespace Socket.IO et contrôle des salons
│   ├── common/                # accès, DTO de pagination, événements, présentateurs
│   ├── config/                # validation des variables d’environnement
│   ├── prisma/                # cycle de vie Prisma et pool PostgreSQL
│   ├── bootstrap.ts           # CORS, Helmet, validation, filtres et Swagger
│   ├── app.module.ts
│   └── main.ts
├── test/                      # tests unitaires et API/PostgreSQL/Socket.IO
├── docker-compose.yml
└── .env.example
```

Les services contrôlent les droits, même après les guards HTTP. Les opérations sur un groupe acquièrent un verrou de ligne PostgreSQL avant l’accès ou l’écriture. L’approbation verrouille le général puis le compte ; le déplacement verrouille les deux groupes dans un ordre stable, puis le membre. Le vote crée la participation et ses choix dans une seule transaction, avec unicité `(pollId,userId)` et clés composites empêchant un choix d’un autre sondage.

Les migrations SQL ajoutent un index partiel pour l’unicité du groupe général, un trigger empêchant sa suppression ou la modification du flag système, des checks de contenu et des clés composites pour les médias et les sondages des messages. Conserver ces invariants lors des futures migrations ; `db push` ne remplace pas les migrations SQL personnalisées.

## Authentification et statuts

1. `POST /auth/register` accepte email, mot de passe, prénom et nom. Les mots de passe ont 12 à 128 caractères ; les valeurs sont hashées avec Argon2id. L’email est normalisé. `role`, `status` et les autres champs inconnus sont refusés.
2. Le compte est `USER/PENDING`. La connexion est autorisée afin de lire son propre statut ; la messagerie reste interdite jusqu’à `APPROVED`. Un compte `REJECTED` peut aussi consulter son statut.
3. La connexion renvoie `{ accessToken, refreshToken, tokenType, expiresIn, userId, sessionId, user }`. `user` n’inclut jamais de hash.
4. Envoyer `Authorization: Bearer <accessToken>` aux routes protégées. La session est relue en base pour vérifier la révocation et le statut courant, au lieu de faire confiance à un rôle embarqué dans le token.
5. `POST /auth/refresh` reçoit `{ refreshToken }`. Le refresh token est un JWT signé avec un secret distinct ; seule son empreinte Argon2id est conservée en base. Rotation sous verrou avec compteur. Réutiliser un ancien token révoque toute sa session et déconnecte ses sockets, y compris si une requête de refresh concurrente a réussi. Le client doit donc sérialiser ses appels de refresh.
6. `POST /auth/logout` révoque la session courante, invalide immédiatement ses access tokens et ferme ses sockets. Les autres sessions de l’utilisateur restent actives. Un access token non révoqué expire normalement au bout de son TTL, même après rotation du refresh token.

Les tokens sont renvoyés en JSON ; aucune configuration de cookie ou persistance navigateur n’est imposée ici. La future intégration PWA devra définir leur stockage et éviter de recopier le stockage démo de Zustand pour conserver des secrets.

## Endpoints HTTP

Préfixe de toutes les routes ci-dessous : `/api/v1`. UUID requis dans les paramètres. Sauf mention publique ou statut personnel, les routes nécessitent un membre approuvé. Les actions sur un groupe nécessitent aussi l’appartenance au groupe, y compris pour un admin.

| Méthode et route                     | Accès                         | Corps / résultat                                                                                       |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /health`                        | Public                        | `{status:"ok"}` ; processus démarré après connexion DB                                                 |
| `POST /auth/register`                | Public                        | `{email,password,firstName,lastName}` → utilisateur `PENDING`                                          |
| `POST /auth/login`                   | Public                        | `{email,password}` → paire JWT et utilisateur                                                          |
| `POST /auth/refresh`                 | Public                        | `{refreshToken}` → paire JWT renouvelée                                                                |
| `POST /auth/logout`                  | Authentifié, tout statut      | Révocation de la session, 204                                                                          |
| `GET /auth/me`, `GET /users/me`      | Authentifié, tout statut      | Profil et statut actuels                                                                               |
| `PATCH /users/me`                    | Authentifié, tout statut      | `{firstName?,lastName?,bio?}` ; aucun rôle ni email éditable                                           |
| `GET /users`                         | Admin                         | `search`, `status`, `limit`, `cursor` → page d’utilisateurs                                            |
| `GET /admin/stats`                   | Admin                         | `totalUsers,pendingUsers,approvedUsers,groups,messages,polls`                                          |
| `GET /approvals`                     | Admin                         | `limit`, `cursor` → comptes en attente                                                                 |
| `PATCH /approvals/:userId`           | Admin                         | `{status:"APPROVED"\|"REJECTED"}` ; compte encore `PENDING` uniquement                                 |
| `GET /groups`                        | Membre                        | Groupes dont il est membre                                                                             |
| `POST /groups`                       | Admin                         | `{name,description?,color?}` ; groupe privé uniquement                                                 |
| `GET /groups/:id`                    | Membre du groupe              | Groupe avec `memberIds` et résumés des membres sans emails                                             |
| `PATCH /groups/:id`                  | Admin membre                  | `{name?,description?,color?,imageMediaId?}` ; image appartenant au groupe, `null` pour effacer l’image |
| `DELETE /groups/:id`                 | Admin membre                  | Suppression du groupe privé, messages, sondages et médias ; 204                                        |
| `PUT /groups/:id/members/:userId`    | Admin membre                  | Ajout idempotent d’un compte approuvé                                                                  |
| `DELETE /groups/:id/members/:userId` | Admin membre                  | Retrait ; général et administrateurs protégés                                                          |
| `POST /groups/members/:userId/move`  | Admin membre des deux groupes | `{fromGroupId,toGroupId}` ; déplacement atomique entre groupes privés                                  |
| `GET /groups/:groupId/messages`      | Membre du groupe              | `limit`, `cursor` → page d’historique                                                                  |
| `POST /groups/:groupId/messages`     | Membre du groupe              | `{text}` ; 1 à 4000 caractères, auteur déterminé par la session                                        |
| `POST /groups/:groupId/photos`       | Admin membre                  | Multipart `file`, `caption?` → message photo et URL protégée                                           |
| `GET /uploads/:id`                   | Membre du groupe              | Flux WebP authentifié, `Cache-Control: private, no-store`                                              |
| `POST /groups/:groupId/polls`        | Admin membre                  | `{question,options:string[],singleChoice,endsAt?}`                                                     |
| `GET /polls`                         | Membre                        | Sondages de ses groupes, paginés                                                                       |
| `GET /polls/:id`                     | Membre du groupe              | Sondage, options et participations                                                                     |
| `POST /polls/:id/votes`              | Membre du groupe              | `{optionIds:string[]}` ; une participation, 409 si déjà voté ou clôturé                                |

Une page renvoie `{items,nextCursor}` avec `limit=30` par défaut et au plus 100. L’historique est classé du plus récent au plus ancien avec `(createdAt,id)` comme ordre stable ; l’adaptateur UI pourra inverser une page pour son affichage chronologique. Les curseurs d’historique sont vérifiés dans le groupe demandé. Les dates sont des chaînes ISO dans les réponses JSON.

Les résultats de sondage sont calculables depuis `votes` : nombre de participations = `votes.length`, votes d’une option = nombre de participations qui contiennent son identifiant. Le mode multiple autorise plusieurs options dans **une seule** participation. Les sondages ne sont pas anonymes dans ce modèle, conformément au contrat frontend existant.

Les erreurs centrales renvoient `{statusCode,message,requestId,timestamp}` ; `message` peut contenir la structure de validation Nest. Les erreurs internes et Prisma ne renvoient ni stack, ni requête SQL, ni hash. 400 : données invalides ; 401 : session invalide ; 403 : accès refusé ; 404 : ressource absente ; 409 : conflit métier ou unicité ; 413 : limite multipart ; 429 : limite de requêtes.

## Socket.IO

Namespace : `http://127.0.0.1:3002/community`, chemin de transport standard `/socket.io`.

```ts
const socket = io(`${apiOrigin}/community`, {
  auth: { token: accessToken },
  transports: ["websocket"],
});
socket.on("session:ready", ({ userId, status }) => {
  // Only approved members can join their groups.
});
socket.emit("group:join", { groupId }, (ack) => {
  if (!ack.ok) console.error(ack.error);
});
socket.emit("message:send", { groupId, text: "Bonjour la team !" }, (ack) => {
  // ack.ok and ack.message, or ack.error
});
```

| Événement client → serveur | Corps            | Accusé de réception                   |
| -------------------------- | ---------------- | ------------------------------------- |
| `group:join`               | `{groupId}`      | `{ok:true,groupId}` ou erreur d’accès |
| `group:leave`              | `{groupId}`      | `{ok:true}` ou erreur                 |
| `message:send`             | `{groupId,text}` | `{ok:true,message}` ou erreur         |

| Événement serveur → client | Destination / contenu                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `session:ready`            | Socket authentifiée : `{userId,status}`                                                                                |
| `message:created`          | Membres ayant rejoint le salon : message texte, photo ou sondage                                                       |
| `poll:created`             | Salon : nouveau sondage                                                                                                |
| `poll:updated`             | Salon : sondage avec ses votes à jour                                                                                  |
| `group:updated`            | Salon : informations du groupe et identifiants des membres                                                             |
| `group:removed`            | Ancien salon : `{groupId}`, puis sortie du salon                                                                       |
| `group:member-added`       | Sockets de l’utilisateur affecté : `{groupId,userId}` ; le client recharge ses groupes et demande à rejoindre le salon |
| `group:member-removed`     | Sockets de l’utilisateur retiré : `{groupId,userId}`, après sortie immédiate de ses sockets du salon                   |
| `user:reviewed`            | Sockets de l’utilisateur concerné : son profil et nouveau statut                                                       |
| `disconnect`               | Fin de token, logout, rejeu refresh, session invalide ou limite de paquets                                             |

`session:revoked` est un événement interne ; il entraîne la déconnexion, sans exposer de tokens. Chaque connexion rejoint uniquement les salons privés internes de son utilisateur et de sa session. Le client doit explicitement rejoindre un groupe. Les comptes en attente/refusés peuvent recevoir leur changement de statut mais ne rejoignent pas les conversations. Chaque événement entrant vérifie le JWT courant ; chaque diffusion de contenu de groupe revérifie session, statut et appartenance sous verrou de groupe avant émission. La socket expire à l’expiration de l’access token ; reconnecter avec un token renouvelé.

Les créations de sondages, votes et affectations passent par HTTP, puis sont diffusées sur Socket.IO. Cela garde un chemin de validation unique et des accusés HTTP clairs. Une erreur de requête d’événement renvoie `{ok:false,error:{code,message}}`. Un dépassement de fréquence ou une session invalide au niveau middleware déconnecte la socket.

## Images et stockage

L’extension et le MIME envoyés par le navigateur ne sont pas considérés comme une preuve. Sharp tente de décoder les octets et n’accepte que JPEG, PNG, WebP et GIF, avec au plus 25 millions de pixels. L’image est orientée, réduite au maximum à 2400×2400, réencodée en WebP et débarrassée des métadonnées ; une seule image d’un GIF est conservée. Aucun SVG ni fichier original n’est servi.

La limite de transport multipart est de 10 Mio au maximum ; `UPLOAD_MAX_BYTES` peut imposer une limite métier plus basse. Les chemins utilisent des UUID générés par le serveur. Les fichiers restent hors de tout répertoire statique. Les métadonnées enregistrent auteur, groupe, dimensions, MIME et taille ; `storageKey` n’est pas envoyé au frontend. L’interface `MediaStorage` et son provider `MEDIA_STORAGE` permettent de remplacer le stockage local par un stockage objet privé sans changer les routes. Les échecs avant commit nettoient les fichiers créés ; la suppression d’un groupe nettoie ses fichiers après commit. Un échec de nettoyage est journalisé sans données de fichier et peut nécessiter un ramasse-miettes ultérieur.

Pour une image de groupe, publier d’abord une photo dans ce groupe puis récupérer son identifiant dans `photoUrl` et utiliser `imageMediaId`. Cette première API publie donc également le visuel dans la conversation. Une route d’upload d’avatar sans publication pourra être ajoutée ultérieurement si le produit le nécessite.

## Compatibilité frontend

Les contrats de la phase 2 ont servi au raccordement de la phase 3. Les noms de rôles, statuts, messages, champs utilisateurs, `memberIds`, options de sondage et votes sont conservés dans les réponses présentées. Le frontend utilise maintenant ses services réels ; les points suivants documentent les différences avec les anciens mocks.

Différences prises en charge par l’adaptateur frontend de la phase 3 :

- Remplacer `AuthSession {userId,mode:'demo'}` par une vraie session JWT ; aucun identifiant démo n’existe ici.
- Les identifiants sont des UUID, dont celui du général : le découvrir via `isGeneral`, au lieu de coder `'general'` en dur.
- L’inscription renvoie le compte sans connecter automatiquement ; appeler `login` pour obtenir la session et afficher le statut.
- Séparer `saveGroup` en création `POST` et modification `PATCH`. Les membres se gèrent par les routes dédiées ; le client ne transmet ni `isGeneral` ni une liste arbitraire de membres dans le DTO groupe.
- `send` transmet seulement `{text}` ; l’auteur, les IDs, dates et kinds sont déterminés par le serveur. Photos et sondages ont des routes séparées.
- `createPoll` transmet `options: string[]` et reçoit les IDs des options créés par la base. `vote` transmet seulement les IDs de choix, sans `userId`.
- Pas de `snapshot` global illimité : agréger `/auth/me`, `/groups`, les membres résumés de chaque groupe et l’historique paginé ; utiliser `/admin/stats` pour le dashboard et `/users` uniquement pour l’admin.
- `Group` reçoit aussi des dates. Le détail groupe inclut des résumés `{id,firstName,lastName,bio,role}`, sans email. Les champs facultatifs absents sont omis dans les présentateurs.
- Les URLs de médias sont relatives à l’origine API et exigent Bearer. Le `<img src>` de la démo ne peut pas joindre cet en-tête : utiliser `fetch` authentifié puis un Blob URL, libéré avec `URL.revokeObjectURL`. Ne pas placer de JWT dans une URL ou dans le cache du service worker.
- Les événements existants `message:created`, `poll:updated`, `group:updated`, `user:reviewed` sont conservés. Ajouter la gestion des créations de sondage et des changements d’appartenance. Dédupliquer les messages par ID entre réponse HTTP, ack et événement.
- `notifications()` et `notification:created` ne sont pas implémentés : la phase 2 n’a pas de modèle de notifications persistantes ni de push. Les changements de statut et d’appartenance ont leurs événements dédiés.

## Tests et vérifications

```powershell
npm.cmd run prisma:validate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Exécuter les intégrations sur une base nouvellement créée :

```powershell
npm.cmd run test:isolated
npm.cmd run test:frontend:isolated
```

Le lanceur utilise DATABASE_URL pour créer une base vide avec un nom aléatoire `chtaw_test_<12 caractères hexadécimaux>`. Il applique les migrations et transmet explicitement l’identité de cette base aux tests. Une base existante n’est jamais réinitialisée par le lanceur. Le rôle PostgreSQL doit disposer du droit CREATE DATABASE. Les bases de test sont conservées pour inspection. Le serveur frontend est arrêté automatiquement après les tests.

Les anciennes commandes de préparation manuelle ne constituent plus le parcours recommandé. La suite backend refuse une base dont le nom et le marqueur ISOLATED_TEST_DATABASE ne correspondent pas à ce schéma de sécurité.

Les tests couvrent les DTO, le hash/seed, les comptes en attente/refusés, l’approbation concurrente et le général, les contrôles admin, l’appartenance, les messages paginés, les images falsifiées/privées, les sondages simples/multiples/clôturés, les votes concurrents, CORS, Socket.IO, les retraits, le refresh rejoué et le logout. Voir `VERIFICATION.md` pour les résultats réellement obtenus.

## Limites de cette livraison

Cette version est prévue pour un processus NestJS. Le rate limiter HTTP est en mémoire (120 requêtes/minute par IP et route, 5/minute pour login/register, 10/minute pour refresh) et la limite Socket.IO est de 60 paquets/minute par socket. Pour plusieurs instances, prévoir un stockage partagé de quotas, l’adaptateur Socket.IO Redis et une stratégie partagée de révocation. Les checks DB de réception protègent néanmoins le contenu des groupes contre les salons devenus obsolètes.

Les événements en mémoire suivent le commit ; ils ne constituent pas un journal durable. Après déconnexion ou livraison manquée, recharger l’historique HTTP. Un outbox transactionnel sera nécessaire si l’application doit garantir la livraison après un crash. Les listes de votes et membres ne sont pas encore paginées séparément : prévoir des agrégats et une pagination pour de très grandes communautés.

Aucun flux de récupération de mot de passe, de vérification d’email, de notifications push ou de suppression de compte n’a été ajouté hors du périmètre demandé. Avant production : TLS, configuration explicite de proxy si nécessaire, sauvegardes PostgreSQL, stockage objet privé et exploitation des logs/quotas. Aucune de ces opérations de déploiement n’a été effectuée.

Références de mise en œuvre : [authentification NestJS](https://docs.nestjs.com/security/authentication), [guards WebSocket NestJS](https://docs.nestjs.com/websockets/guards), [Prisma 7 et drivers PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers).
## Corrections de novembre 2026

Les modifications manuelles du groupe général sont interdites, pour tous les rôles. POST /api/v1/auth/logout-browser révoque une session via son cookie avec contrôle d’origine, même sans access token valide. GET /api/v1/approvals/:userId/history est réservé aux administrateurs. La migration additive AdmissionDecision enregistre les nouvelles décisions dans la même transaction que le changement de statut ; elle ne reconstitue pas les événements historiques absents.

Voir ../PRODUCTION.md pour HTTPS, cookies, CORS, stockage persistant et limites mono-instance.


## Présences personnelles de l’étudiant

GET /api/v1/attendance/me utilise exclusivement l’identité de l’acteur authentifié. Aucun userId arbitraire n’est accepté. Les champs historiques restent disponibles ; items, stats, total, page, limit, timeZone et groups fournissent la projection personnelle paginée.

La projection utilise les créneaux startsAt/endsAt et les validations existantes. Les futures séances ne sont pas des absences, les statuts inconnus restent en attente et les annulations sont exclues des statistiques. Une heure de fin manquante n’est pas inventée. Les inscriptions historiques propres sont conservées conformément au contrat existant, tandis que les futures séances d’un groupe quitté sont exclues de la nouvelle projection.

Les paramètres de filtre serveur restent validés pour les autres clients, mais l’écran étudiant utilise uniquement les listes UPCOMING et ABSENT avec pagination indépendante. Aucun changement de schéma ni migration n’est nécessaire.
