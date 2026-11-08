# Configuration de production

## Vitrine

Définir avant compilation `VITE_PWA_URL` (URL publique HTTPS de Team Chtaw) et `VITE_CONTACT_EMAIL` (adresse réelle du coach). Sans configuration valide, aucun lien de téléchargement ou contact inventé n'est affiché. Ne pas utiliser la configuration protégée de l'application mobile pour la vitrine.

## Application Next.js

Deux topologies sont possibles :

- Même origine : laisser `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_SOCKET_URL` absentes et acheminer `/api/v1/*` et `/socket.io/*` vers NestJS au niveau du reverse proxy, avec prise en charge WebSocket.
- Origines séparées : définir avant compilation `NEXT_PUBLIC_API_URL` avec le préfixe `/api/v1` et `NEXT_PUBLIC_SOCKET_URL` avec l'origine HTTPS du backend. Les URL HTTP et localhost explicites sont refusées en compilation de production.

Le Service Worker requiert HTTPS (localhost est accepté en développement), et s'enregistre uniquement en production. Les fonctions métier nécessitent le réseau. L'écran hors ligne ne conserve aucune conversation.

## Backend

Utiliser `NODE_ENV=production`, `DATABASE_URL`, deux secrets JWT distincts de 48 caractères minimum, et `CORS_ORIGINS` contenant les origines HTTPS exactes de la PWA. Ne jamais publier les secrets via des variables NEXT_PUBLIC ou VITE.

Les cookies de refresh sont HttpOnly et Secure en production. Utiliser `REFRESH_COOKIE_SAMESITE=lax` pour la même origine ou des sous-domaines du même site ; un déploiement réellement intersite peut nécessiter `none` et reste soumis aux restrictions des navigateurs sur les cookies tiers. Vérifier sur Safari et Chrome.

Appliquer les migrations additives avec `npm run db:migrate`. La migration des décisions ne reconstitue pas les auteurs et dates des décisions anciennes. Aucun reset ni seed n'est nécessaire pour cette correction.

Configurer le reverse proxy et l'écoute du backend sans exposer PostgreSQL. Conserver un volume persistant pour `UPLOAD_DIR` et prévoir des sauvegardes PostgreSQL et médias. Pour plusieurs instances, remplacer le bus d'événements mémoire et le stockage local par des services partagés. Ces travaux d'infrastructure restent hors de cette correction.

La CSP Next.js limite les origines et interdit les objets et l'intégration dans des frames. Les scripts inline de démarrage Next.js restent permis ; une politique par nonce nécessiterait un rendu dynamique dédié.

## Validation avant publication

Vérifier HTTPS, proxy API/WebSocket, cookies, rôles, menus au clavier, rendu 360/768/1440 px, installation Android/iOS, lancement standalone, réouverture et mise à jour consentie. Les tests Node/jsdom ne remplacent pas ces contrôles physiques.

## Notifications et Web Push

Appliquer la migration additive `202611050002_notifications` avant de démarrer cette version du backend. Le script `chtaw-team-backend/scripts/migrate-notifications.mjs` contrôle les migrations en attente et compare les données métier avant/après. Ne pas utiliser de reset.

Les notifications et rappels sont persistants en PostgreSQL. Un passage toutes les 15 secondes traite les files et les rappels à échéance, avec verrous et contraintes uniques. Les invalidations de notifications entre instances utilisent PostgreSQL LISTEN/NOTIFY puis la room Socket.IO privée de chaque utilisateur. Le partage des autres événements métier et des médias entre instances reste un chantier distinct.

Configurer ensemble `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` (contact mailto ou HTTPS réel). Sans ces trois valeurs, le centre interne fonctionne et le Push reste désactivé. Générer la paire une seule fois avec `npx web-push generate-vapid-keys`, la conserver dans le gestionnaire de secrets et ne jamais publier la clé privée dans NEXT_PUBLIC, VITE ou les logs. Autoriser les connexions HTTPS sortantes vers les services Push. `NOTIFICATION_TIMEZONE` vaut Africa/Tunis par défaut ; `PUSH_ALLOWED_ORIGINS` permet uniquement des origines HTTPS exactes supplémentaires.

Le navigateur doit utiliser la version de production de la PWA, HTTPS (ou localhost), un Service Worker actif et une action explicite pour l’autorisation. Sur iOS/iPadOS, tester une PWA ajoutée à l’écran d’accueil sur une version compatible. Après réinstallation ou changement de compte, réactiver cet appareil depuis Paramètres. Les données privées et l’historique ne sont jamais mis dans le cache du Service Worker ; le Push affiche seulement un message générique.
