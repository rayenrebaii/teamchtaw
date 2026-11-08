# Phase 2 — Rapport historique du 3 novembre 2026

Le raccordement frontend et les vérifications plus récentes figurent dans [VERIFICATION-PHASE3.md](VERIFICATION-PHASE3.md). Les constats ci-dessous décrivent la livraison de la phase 2.

Travail réalisé exclusivement dans `chtaw-team-backend`. Les types et contrats du frontend ont été examinés en lecture seule. Aucun changement au frontend PWA, au site vitrine ou au projet Barber. Aucun déploiement ni publication GitHub.

| Vérification | Résultat |
| --- | --- |
| Installation npm et client Prisma | Réussie ; lockfile fourni |
| PostgreSQL 17 dans Docker Compose dédié | Conteneur sain, port local `127.0.0.1:5434` |
| Migrations sur `chtaw` | 2 migrations appliquées |
| Migrations sur `chtaw_test` | 2 migrations appliquées |
| `npm.cmd run prisma:validate` | Schéma valide |
| `npm.cmd run typecheck` | Réussi, TypeScript strict, aucune erreur |
| `npm.cmd run lint` | Réussi, aucune erreur ni avertissement |
| `npm.cmd run build` | Réussi |
| `npm.cmd test` | **19 tests unitaires réussis** |
| `npm.cmd run test:integration` | **33 tests d’intégration réussis** |
| `npm.cmd run dev` | Démarrage NestJS réussi avec connexion PostgreSQL |
| `npm.cmd start` après build | Démarrage du JavaScript compilé réussi |
| `GET /api/v1/health` | HTTP 200, modes développement et compilé |
| `GET /docs-json` | HTTP 200, document OpenAPI généré |

Total : **52 tests réussis** sur deux suites Jest. Les tests d’intégration utilisent de vrais appels HTTP, de vrais clients Socket.IO et un PostgreSQL réel ; aucune base en mémoire ne remplace PostgreSQL.

## Scénarios vérifiés

- Configuration : secrets absents/identiques, origines exactes et HTTPS en production, limites numériques.
- DTO : normalisation d’email et noms, mot de passe court, rôle/statut publics interdits, valeurs `null`, options et booléens, expéditeurs et votes injectés.
- Accès : session révoquée, statut en attente malgré des claims antérieurs, restriction admin et appartenance.
- Seed réel : création de l’admin et du général, idempotence, aucun reset du hash existant, refus de promotion d’un compte public.
- Inscriptions en attente/refusées, lecture du statut et refus d’accès aux conversations.
- Approbation avec ajout automatique au général et validations concurrentes ne créant qu’une affectation.
- Groupes privés invisibles aux non-membres, général permanent, affectations idempotentes et déplacement atomique.
- Envoi texte, contrôle d’auteur et pagination de l’historique par curseur.
- Sondages admin, vote unique concurrent, sélections simples/multiples, choix inconnus et clôture.
- Images aux octets falsifiés, SVG, dépassement de taille, réencodage WebP, upload réservé à l’admin et téléchargement privé.
- CORS autorisé/refusé et limitation effective des tentatives de connexion.
- WebSocket authentifié/refusé, validation de compte notifiée, messages temps réel, groupe étranger refusé, retrait immédiat du salon et absence de réception après retrait.
- Rotation de refresh et révocation de la session lors d’un rejeu ; logout invalidant HTTP et fermant les sockets.
- Suppression d’un groupe privé, de ses messages et métadonnées de médias.
- Statistiques réservées à l’administration.

Un premier passage d’intégration a détecté une incompatibilité d’écriture imbriquée Prisma pour les clés composites des choix de vote. Elle a été corrigée par deux écritures explicites dans la même transaction ; les scénarios de vote simple, multiple et concurrent réussissent sur la version livrée.

## État local et limites

- `.env` local généré avec secrets aléatoires, sans les afficher. Il n’est pas versionné. Les variables seed administrateur sont volontairement à renseigner par l’utilisateur ; aucun admin de développement n’a été créé avec des credentials fixes.
- Le conteneur PostgreSQL dédié reste disponible. Les processus de vérification de l’API sont arrêtés après les contrôles ; relancer avec `npm.cmd run dev` ou `npm.cmd start`.
- La base `chtaw_test` contient uniquement des fixtures jetables. La suite vérifie exactement ce nom avant de vider ses tables ; ne pas l’utiliser pour des données à conserver.
- Pas de modification du stockage ou de l’authentification du frontend : le raccordement HTTP/JWT/Socket.IO reste une étape ultérieure, conformément au brief.
- Les tests couvrent le backend. Aucune validation d’installation PWA ou de parcours visuel dans le navigateur n’est revendiquée pour cette phase.
- Stockage local privé, rate limiting en mémoire et événements pour un processus NestJS. Redis, outbox durable, stockage objet et exploitation multi-instance restent des extensions documentées, pas des capacités annoncées comme déjà livrées.
