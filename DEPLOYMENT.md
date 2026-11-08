# Team Chtaw — déploiement

État du 8 novembre 2026. Dépôt : https://github.com/rayenrebaii/teamchtaw (`main`).

## État réel

| Service | Plateforme | État / URL |
| --- | --- | --- |
| Vitrine | Vercel Hobby | Publiée : https://teamchtaw-vitrine.vercel.app |
| PWA | Vercel Hobby | Publiée et raccordée : https://teamchtaw-pwa.vercel.app |
| Backend | Render Free | En ligne : https://teamchtaw-api.onrender.com ; service `srv-dbo8v2u7bikc73895mhg` |
| PostgreSQL | Neon Free | Projet `shy-feather-22035914`, branche `production` (`br-blue-boat-bdecma85`), données migrées et vérifiées |

Incident résolu : `/api/v1/auth/login` renvoyait une page HTML 404 de Next.js
car l'API n'était pas déployée. Le backend Render est désormais en ligne avec
Neon, et les réécritures Next.js acheminent les appels HTTP vers ce backend.
La connexion avec un compte existant a réussi aussi bien directement sur
Render qu'au travers du domaine PWA, puis dans un navigateur réel automatisé.

## Architecture et configuration

- Vitrine React/TanStack Start/Vite/Nitro, racine du dépôt. Cible Vercel avec
  `NITRO_PRESET=vercel`, sortie `.vercel/output`. Aucun middleware Supabase actif.
- PWA Next.js 16, racine `chtaw-team-pwa`, projet `prj_ViAWAGY0ZYg29UCu0ql1hG6TU5Cb`.
- API NestJS/Prisma/Socket.IO, racine `chtaw-team-backend`, configuration `render.yaml`.
  `plan: free`, `HOST=0.0.0.0`, `PORT` fourni par Render, Swagger désactivé.
  Build : `npm ci --include=dev && npm run prisma:generate && npm run build`.
  `--include=dev` est indispensable malgré `NODE_ENV=production` pour disposer
  de Prisma et TypeScript pendant la compilation. Démarrage : `npm start`.
- Neon : `DATABASE_URL` poolée et `DATABASE_DIRECT_URL` directe pour les migrations
  et LISTEN/NOTIFY. TLS vérifié ; aucune désactivation de validation TLS.
- Images privées : nouveau stockage PostgreSQL `StoredMedia`, quota applicatif
  de 100 Mio, 10 Mio maximum par objet. Adapté au petit volume actuel, pas à une
  photothèque illimitée. Les lectures passent toujours par les droits des groupes.
  Aucun Supabase ni disque éphémère Render requis pour ce flux.
- Les anciennes règles mobiles `profiles.approved` et `app_config` sont conservées.

Variables Render : `NODE_ENV`, `HOST`, `PORT`, `NODE_VERSION`, `DATABASE_URL`,
`DATABASE_DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`,
`REFRESH_COOKIE_SAMESITE=lax`, `MEDIA_STORAGE=postgres`, `MEDIA_MAX_TOTAL_BYTES`,
`SWAGGER_ENABLED=false`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`NOTIFICATION_TIMEZONE=Africa/Tunis`. Les secrets JWT existants sont préservés.

Variables PWA : `BACKEND_URL` (origine Render), `NEXT_PUBLIC_SOCKET_URL` (même
origine), `NEXT_PUBLIC_APP_AVAILABLE=true` seulement une fois les comptes vérifiés.
Laisser `NEXT_PUBLIC_API_URL` absente : `/api/v1/*` est réécrit vers Render pour
conserver des cookies de session HttpOnly/Secure sur le domaine de la PWA.

Variables vitrine : `VITE_PWA_URL=https://teamchtaw-pwa.vercel.app/install`,
`VITE_CONTACT_EMAIL` si une adresse publique réelle est fournie.

## Sauvegardes et migration

L'import initial autorisé dans Neon a été effectué dans une cible vide, dans
une transaction sans `--clean`. Les 24 tables et 86 lignes, empreintes, colonnes,
index, contraintes d'origine, triggers et extensions ont été comparés avec succès.
Le changement PostgreSQL 17 vers 18 expose aussi 153 contraintes NOT NULL.

Archive préservée : `.deployment-private/chtaw-before-neon-20261108.dump`.
SHA-256 : `94e74b34ac9b1613753b80387e1f361c733a07fbc801af77dffc202189718957`.
L'archive a été intégralement décompressée pour vérification. Les deux WebP sont
sauvegardés dans `.deployment-private/uploads` et leurs empreintes sont identiques
aux fichiers locaux. Aucun volume, fichier local ou backup n'a été supprimé.

La migration additive approuvée `202611080001_durable_media` est appliquée et
ajoute uniquement `StoredMedia`. Une seule image est encore référencée par
`Media` : ses 90 386 octets sont copiés et son SHA-256 vérifié dans Neon.
Les deux sauvegardes locales (216 954 octets au total) sont conservées ; le
fichier non référencé n'a pas été importé inutilement. Aucun objet existant
n'a été écrasé. Ne jamais exécuter de seed, reset ou restauration complète
sur la base importée.

Pour une prochaine sauvegarde, choisir un nouveau nom daté, utiliser une
connexion directe et un pg_dump 18+ pour Neon 18. Restaurer uniquement dans une
cible isolée approuvée et vérifier l'inventaire avant de considérer la restauration
comme validée. Les inventaires, clés et backups restent dans `.deployment-private`,
ignoré par Git et Vercel.

## Icône sur ordinateur et installation mobile

Le propriétaire a choisi une vraie installation PWA avec icône sur mobile.
Le manifeste utilise `display: standalone`, `start_url: /app`, des icônes
192/512 px et la capacité web app Apple. Android/Chrome/Edge proposent leur
confirmation native lorsque `beforeinstallprompt` est disponible. Sur iPhone,
Safari impose Partager puis Sur l'écran d'accueil (Ouvrir comme app web activé
si cette option apparaît). Aucune installation silencieuse n'est annoncée.

Sur Windows et Mac, le bouton télécharge `/downloads/Team-Chtaw.html`.
Ce petit document sans script ouvre exclusivement
`https://teamchtaw-pwa.vercel.app/app` par redirection HTML, avec un lien de
secours, et est servi en pièce jointe. Les téléchargements `.url` ne sont pas
utilisés car les navigateurs Chromium actuels les renomment en `.download`.
L'utilisateur doit les enregistrer ou les déplacer sur le Bureau pour que
l'icône y apparaisse. Le site n'écrit pas directement dans son Bureau.
Ces raccourcis d'ordinateur ouvrent le navigateur habituel.

L'ancien modal générique est retiré. Les instructions restantes s'affichent
dans la page uniquement sur les plateformes sans prompt natif disponible.
Le Service Worker v8 ne remplace jamais un téléchargement de raccourci par
la page HTML hors ligne. `/install` reste public et indépendant de la session.

## Vérifications

Les builds, TypeScript et tests unitaires ont été exécutés. Après le remplacement
du stockage : 86 tests unitaires backend et 87 tests d'intégration backend sur
base locale isolée réussis. PWA : 101 tests logiques et 58 tests d'interface réussis
pour l'installation mobile et les raccourcis, puis 31 scénarios d'interface
concernés relancés après l'ajustement de détection de plateforme.
La compilation Vercel fraîche nécessite `@testing-library/dom` explicitement
présent en devDependency (peer sinon absent avec legacy-peer-deps).

Commandes backend : `npm ci`, `npm run prisma:generate`, `npm run build`,
`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:isolated`.
PWA : `npm ci`, `npm test`, `npm run build`, `npm run lint`.
Vitrine : `npm test`, `npm run lint`, puis build avec `NITRO_PRESET=vercel`.
Les scripts isolés créent leurs propres bases de test et les conservent.

Avant de déclarer le correctif publié, vérifier les vraies URL : santé API avec
requête PostgreSQL, connexion et cookie au travers du proxy PWA, restauration de
session, contrôle des rôles et appartenances, déconnexion, WebSocket et médias.
Les tests locaux ne constituent pas ces contrôles de production.

Contrôles publics effectivement exécutés avec succès après déploiement :

- Santé Render et via le proxy PWA : la route exécute `SELECT 1` dans Neon.
- Connexion avec un compte existant, profil privé et lecture de 3 groupes.
- Cookie de refresh Secure/HttpOnly/SameSite=Lax ; aucun refresh token dans le JSON.
- Rotation par cookie, handshake Socket.IO et révocation de session après logout.
- Formulaire de connexion dans Edge automatisé à 390 px, cookie sur le domaine
  `teamchtaw-pwa.vercel.app`, rechargement conservant la session et logout.
- Le parcours de connexion publié a été vérifié sans erreur JavaScript.
  Le manifeste utilise le réseau en priorité pour actualiser le mode d'installation.
- Image privée lue via le domaine PWA avec le compte autorisé, empreinte SHA-256
  identique à la sauvegarde ; le même accès anonyme retourne 401.

Les rapports détaillés restent dans `.deployment-private`. L'ouverture réelle
d'une icône sur Android/iOS dépend du navigateur et n'a pas été simulée comme
une installation physique. Recréer les raccourcis existants si nécessaire.
Web Push est configuré mais sa réception sur un téléphone n'a pas été vérifiée.

## Limites gratuites

Render Free peut dormir après 15 minutes sans trafic : réveil lent, timers de
rappels suspendus. Les rappels dépassant 15 minutes de retard peuvent être ignorés
par le code. Leur ponctualité n'est pas garantie ; aucune fonction n'est désactivée
silencieusement et aucun maintien artificiel en éveil n'est mis en place.
Les quotas de calcul Neon, de stockage et de bande passante restent à surveiller.
Aucune mise à niveau ou facturation ne doit être activée automatiquement.

Sources : https://render.com/docs/free ; https://neon.com/docs/connect/connection-pooling ;
https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display .
