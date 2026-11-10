# Chtaw Team — autorisation de mise en production

État vérifié le 10 novembre 2026, Africa/Tunis. Ce document remplace les blocages et opérations décrits dans COLLABORATOR-DEPLOYMENT-READINESS.md. Aucune migration de production ni publication de la version Collaborateur effectuée.

## Vérifications

- Invitation Firebase réellement reçue sur `rebaipferayen+chtaw-preprod@gmail.com`. Premier mot de passe choisi sur Firebase ; activation confirmée par l'utilisateur et vérifiée côté backend : COLLABORATOR, APPROVED, activatedAt renseigné, e-mail vérifié, nonce consommé. PostgreSQL et application de ce test sont locaux et isolés ; l'identité Firebase est réelle.
- Vercel reconnecté par le flux officiel. Projet et variables de production accessibles : `prj_ViAWAGY0ZYg29UCu0ql1hG6TU5Cb`, racine `chtaw-team-pwa`, Firebase `chtaw-team-auth-2026`, API/Socket vers Render. Aucun secret affiché.
- Firebase : get/create/update effectifs pour `chtaw-auth-reader@chtaw-team-auth-2026.iam.gserviceaccount.com`. Les deux derniers droits ont déjà été ajoutés après approbation explicite via le rôle minimal `projects/chtaw-team-auth-2026/roles/chtawCollaboratorProvisioner`. Lecture conservée, aucun droit de suppression ajouté ni nouvelle clé créée. Aucune autre modification IAM prévue.
- Render : `srv-dbo8v2u7bikc73895mhg`, actif, Free, déploiement automatique désactivé. Santé backend et page de connexion PWA HTTP 200.
- Variables Firebase, PostgreSQL directe/poolée, JWT, CORS et notifications contrôlées sans divulgation. Seul ajout requis : `ACCOUNT_ACTION_ORIGIN=https://teamchtaw-pwa.vercel.app`.
- PostgreSQL 18.6 accessible. Neuf migrations terminées, neuf checksums conformes, aucun rollback en cours. La migration Collaborateur n'est pas appliquée.
- Simulation `git push --dry-run` réussie vers la branche de livraison ; aucun envoi réellement effectué. Code et tests déjà validés : 533 réussites et builds backend/PWA conservés, sans relance ni modification fonctionnelle pendant cet audit.

## Sauvegarde actualisée et restaurable

La base ayant évolué depuis la précédente archive, une nouvelle sauvegarde complète depuis un snapshot transactionnel cohérent en lecture seule a été réalisée le 10 novembre à 18 h 16, heure de Tunis, avec vérification TLS.

- Archive locale privée : `.deployment-private/chtaw-collaborator-20261110T171648.dump`.
- Taille : 82 791 octets.
- SHA-256 : `80450f6b422ce249f2f1be3038f2e5fadce7294af8ec0a393671b3c166db22e3`.
- Restauration dans un nouveau conteneur PostgreSQL 18 local : réussie, transaction unique et arrêt sur erreur.
- 25 tables restaurées, nombres de lignes et empreintes identiques au snapshot source.
- Preuve : fichier `.dump.verification.json` adjacent, `restoreVerified=true`, `allRowsAndHashesMatch=true`.

Les archives et identifiants restent privés et exclus de Git. La restauration n'a pas écrit en production.

## Version et migration préparées

Inventaire : `.deployment-private/collaborator-release-manifest.json`, 69 fichiers de code/test/config, base Git `59267fde280afccdfa3e8c08a1776cc5c5eead64`. Empreinte de l'inventaire : `9e0f2069a367b2667a560988f37e5301c27f5e5b8760bb09b55b1ce810bd0257`. Le fichier préexistant `chtaw-team-backend/FIREBASE-MIGRATION.md` est exclu de la livraison prévue. Aucun historique publié ne sera réécrit.

Seule migration : `202611100001_collaborator_organizers`, SHA-256 SQL `df9c6bbd4a2ca6929e4dfceaa3767960461dd849e1ad342278b6145c2e512942`.

Elle ajoute le rôle, deux colonnes, trois tables et leurs index/contraintes, élargit la contrainte des types de notifications et initialise les nouveaux compteurs/alertes depuis l'historique existant. Aucune suppression ni réinitialisation de ligne ou colonne existante. Déjà vérifiée sur une copie restaurée : 25 tables préexistantes et toutes leurs lignes conservées. Preuve : `.deployment-private/collaborator-restored-migration-verification.json`. Ce test réussi n'a pas été recommencé.

## Opérations sensibles proposées — après approbation seulement

1. Créer le commit à partir de l'inventaire validé et publier `codex/collaborator-firebase-release` sur le dépôt existant. Aucun push de cette version sur main avant validation backend. Un éventuel aperçu Vercel de branche n'est pas la publication de production. Employer le même SHA pour backend et PWA.
2. Avant migration, vérifier l'absence de dérive et disposer d'une sauvegarde fraîche restaurable ; actualiser celle-ci si le délai ou l'activité le justifie. Conserver les références applicatives actuelles.
3. Ajouter uniquement `ACCOUNT_ACTION_ORIGIN=https://teamchtaw-pwa.vercel.app` sur Render en préservant les autres variables et secrets.
4. Exécuter `npm run db:migrate` dans le backend, connexion directe de production injectée uniquement dans l'environnement du processus. Arrêter si une migration autre que celle approuvée apparaît. Aucun seed, reset, db push ou changement des anciennes migrations.
5. Déployer le SHA approuvé sur Render. Vérifier build, journaux, santé, administration et endpoints. Ne pas publier la PWA si le backend est défaillant.
6. Construire et publier le même SHA sur le projet Vercel existant avec ses variables de production. Vérifier API, Socket, Firebase, journaux et compatibilité des services.
7. Créer via l'administration le Collaborateur `rebaipferayen@gmail.com`. Vérifier avec l'utilisateur invitation, activation, connexion et reset ; tester les fonctions Collaborateur et refus de sécurité dans des groupes/comptes exclusivement de test, sans modifier les données réelles des étudiants. Toute intervention humaine sur les e-mails reste nécessaire : aucun mot de passe ne sera demandé ou envoyé en clair.
8. Consigner SHA, IDs de déploiement, migrations, résultats et problèmes restants. Terminer uniquement après vérification effective du backend, de la base et de la PWA.

## Limites et récupération

Une connexion applicative complète et un reset réel après activation restent à constater ; ils ne sont pas présentés comme déjà réussis en production. Les tests existants couvrent ces parcours et la révocation des sessions. L'authentification des étudiants et les modèles/callback Firebase restent inchangés ; aucun Resend ou achat de domaine prévu.

La migration peut prendre brièvement des verrous sur les tables concernées ; la bascule et le démarrage Render peuvent provoquer une courte indisponibilité. Render Free met le backend en veille après inactivité : les timers de rappels J−1/H−1 ne sont pas garantis pendant la veille. Aucun upgrade payant prévu. [Limites Render Free](https://render.com/docs/free), [quotas Firebase](https://firebase.google.com/docs/auth/limits).

Versions avant livraison : Render `dep-dbou9ijm8hqs73f2eckg`, commit `3dd3473e692d5824167c19de85a813229fb23fb1` ; Vercel `dpl_HqXYzwrsdvi1CQcFC6FsmUyRxmRo`.

Si la migration échoue, arrêter et diagnostiquer son état avant toute relance ou résolution. Si le backend échoue, garder la PWA actuelle. Si la PWA échoue, rétablir sa version précédente au besoin et conserver un backend compatible.

Un ancien backend peut ignorer la nouvelle valeur Prisma COLLABORATOR après création de comptes : son retour n'est pas automatiquement sûr. Privilégier une correction applicative compatible avec le schéma additif. Ne pas supprimer les nouvelles tables ou comptes pour annuler la livraison. Toute restauration de secours commence dans une base distincte ; une bascule nécessiterait une approbation séparée et la prise en compte des nouvelles écritures. Aucun écrasement automatique de la production.

URLs conservées : https://teamchtaw-pwa.vercel.app et https://teamchtaw-api.onrender.com.
