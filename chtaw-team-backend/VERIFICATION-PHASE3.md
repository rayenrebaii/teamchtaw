# Phase 3 — Résultats du raccordement, 3 novembre 2026

Le détail des parcours et limites figure dans le [rapport frontend de la phase 3](../chtaw-team-pwa/VERIFICATION-PHASE3.md).

- Lint, TypeScript strict, validation Prisma et build NestJS : réussis.
- Jest : **23 tests unitaires** et **34 tests d’intégration** réussis sur PostgreSQL réel, soit **57 tests backend**.
- Frontend : **26 tests unitaires** et **13 scénarios d’intégration réels** réussis, soit **39 tests frontend**.
- Total des deux projets : **96 tests réussis**.
- Démarrage de l’API compilée et contrôle HTTP `/api/v1/health` : réussis.
- Aucun déploiement, aucune publication GitHub, aucune modification du site vitrine ou du projet Barber.

Le mode navigateur ajoute un refresh cookie HttpOnly/SameSite, Secure en production, sans renvoyer le refresh token au JavaScript. Le transport JSON historique reste disponible pour les autres clients. Les requêtes cookie exigent une origine autorisée et le header `X-Session-Transport: cookie`, avec CORS credentials limité aux origines explicites.

Les réponses et événements de messages incluent un résumé d’auteur sans email ni hash. Les contrôles de rôles, statuts et appartenance restent côté serveur. Aucun changement du schéma PostgreSQL n’a été nécessaire.

Les tests de cookies, rotation, révocation, origines, concurrence des validations/votes, accès privés et retrait des sockets passent. Le serveur réservé aux scénarios frontend utilise exclusivement la base `chtaw_test` sur le port 3102. Il ne modifie pas le `.env` de développement et ne crée pas de fixtures dans la base `chtaw`.

Les tests de protocole n’incluent pas une vérification visuelle ni une installation PWA sur appareil. Les limites mono-instance, les événements non durables et l’absence de notifications push restent documentés dans les README.
