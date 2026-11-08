# Phase 3 — Intégration réelle, 3 novembre 2026

Les modifications sont limitées à `chtaw-team-pwa` et `chtaw-team-backend`. Les projets existants ont été raccordés sans recréation. Aucun changement au site vitrine, à `Application`, à Supabase ou au projet Barber. Aucun déploiement ni publication GitHub.

## Résultats

| Vérification                                              | Résultat                                            |
| --------------------------------------------------------- | --------------------------------------------------- |
| Frontend : lint                                           | Réussi, aucun avertissement                         |
| Frontend : TypeScript strict                              | Réussi                                              |
| Frontend : tests unitaires                                | **26 réussis** dans 3 fichiers                      |
| Frontend : intégration réelle                             | **13 réussis**                                      |
| Frontend : build Next.js                                  | Réussi, routes publiques/membres/admin conservées   |
| Backend : validation Prisma                               | Réussie, aucune migration supplémentaire nécessaire |
| Backend : lint et TypeScript strict                       | Réussis                                             |
| Backend : tests unitaires                                 | **23 réussis** dans 2 suites                        |
| Backend : intégration PostgreSQL/HTTP/Socket.IO           | **34 réussis**                                      |
| Backend : build NestJS                                    | Réussi                                              |
| Démarrage des deux versions compilées                     | Réussi sur 3001 et 3002                             |
| HTTP frontend `/login`, `/manifest.webmanifest`, `/sw.js` | 200                                                 |
| HTTP backend `/api/v1/health`                             | 200                                                 |

Total : **96 tests réussis**. Les 52 tests de la phase 2 restent couverts ; les nouveaux tests portent notamment sur les cookies de session et le raccordement frontend.

## Parcours réellement exécutés

La suite `test/community.integration.ts` utilise les services frontend et le store Zustand réels, de vrais clients Socket.IO, le backend NestJS et PostgreSQL dans la base dédiée `chtaw_test` :

1. Inscription d’un nouveau compte via le service frontend et connexion automatique.
2. Vérification du statut `PENDING` et refus serveur des conversations.
3. Connexion administrateur dans un contexte de cookies séparé.
4. Approbation et réception de `user:reviewed` par le membre.
5. Apparition automatique du général et chargement de son historique.
6. Affectation à un groupe privé et refus d’un autre groupe.
7. Messages échangés entre deux sessions et absence de doublons entre HTTP et Socket.IO.
8. Téléversement d’un PNG réel par l’admin, réencodage WebP et téléchargement privé ; upload membre refusé.
9. Création d’un sondage et réception en direct.
10. Vote, résultat transmis à l’admin, revote et création membre refusés côté serveur.
11. Déconnexion, invalidation du cookie, puis reconnexion avec mot de passe.
12. Perte de mémoire JavaScript simulant une actualisation, restauration via cookie sans mot de passe et rotation constatée.
13. Fermeture du transport et reconnexion Socket.IO automatique ; coupure prolongée avec récupération de plus d’une page de messages manqués.
14. Retrait du groupe : purge du store, historique et médias refusés par le serveur.

La suite vérifie aussi la pagination réelle sur plusieurs pages, les noms d’auteurs sans emails, les statistiques admin et les actions de création/suppression de groupe du store.

Les tests unitaires frontend vérifient le regroupement des refresh concurrents, le rejeu unique après 401, la conservation de session après 403, l’invalidation d’une réponse de session ancienne, les erreurs réseau sans fallback fictif, la pagination et le rattrapage des messages.

Les tests backend supplémentaires vérifient HttpOnly/SameSite/Secure, le chemin du cookie, son absence du JSON, sa rotation et son effacement, ainsi que le refus des origines absentes ou non autorisées.

## Confidentialité et PWA

- Access token uniquement en mémoire ; refresh token en cookie HttpOnly, Secure en production, SameSite configurable. Aucun mot de passe ni token dans localStorage/sessionStorage.
- Seule la préférence de thème est persistante dans le store réel. Les anciens modules de démo ne sont importés par aucune page ou composant actif.
- Les identifiants de test et les données synthétiques sont réservés à `chtaw_test`. Aucun fixture de test n’est créé dans `chtaw` par la suite frontend.
- Images privées chargées par requête Bearer puis URL Blob temporaire ; aucun token dans les URLs.
- Manifest, icônes et installation conservés ; cache du service worker passé en v2. API et médias privés exclus du cache. La page hors ligne ne prétend pas conserver les conversations.
- Aucune donnée de démonstration initiale n’a été retrouvée via son email de seed dans les fichiers JavaScript de production inspectés.

## Limites de validation et d’exploitation

Les scénarios d’intégration sont exécutés par un harnais Node avec deux contextes de cookies distincts ; ils valident le raccordement logiciel réel, pas le rendu des composants ou les politiques de cookies d’un navigateur. Aucune validation visuelle ni installation Android/iOS n’est revendiquée. Le contrôle UI disponible avait été bloqué lors des phases précédentes par l’impossibilité de déterminer l’URL du navigateur avec certitude.

À vérifier sur appareils : installation Safari/Android, clavier virtuel, safe areas et interactions tactiles. Les protections de cookie de production ont été testées par assertions de configuration/en-têtes, sans déploiement HTTPS réel. Pour deux utilisateurs simultanés dans un navigateur, utiliser deux profils/contextes ; les onglets d’un même profil partagent le refresh cookie.

Il ne manque aucun endpoint indispensable aux fonctionnalités demandées. Les notifications persistantes/push ne sont pas implémentées. La galerie affiche les photos des pages d’historique chargées. Les listes admin sont réunies après pagination HTTP pour conserver les filtres existants. Le backend reste mono-instance avec quotas en mémoire et événements non durables ; il n’existe pas de file d’envoi hors ligne.

Les serveurs démarrés pour les contrôles sont arrêtés à la fin. PostgreSQL dédié reste disponible ; les commandes de démarrage et la configuration du premier administrateur sont dans le README. Les rapports des phases 1 et 2 sont conservés comme historiques.
