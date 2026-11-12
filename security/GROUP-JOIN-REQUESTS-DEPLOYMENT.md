# Publication des demandes de groupe et des séances dans les conversations

12 novembre 2026, Africa/Tunis. Publication en production demandée par le propriétaire, avec tout le travail fonctionnel de la journée.

- Commit applicatif : `de94a11d7c9bb155b29b1d60f1f900e1422ab495`, poussé normalement sur `codex/collaborator-firebase-release`. Aucun historique réécrit.
- API Render : `dep-dbqsehhsrm7s73dqqjcg`, observée `live` sur ce commit.
- PWA Vercel : `dpl_3ZLSYvH6rfvB98VvYDfvZopS1D8W`, observée `READY`, avec le domaine `teamchtaw-pwa.vercel.app` affecté au même commit.
- Application : https://teamchtaw-pwa.vercel.app ; API : https://teamchtaw-api.onrender.com.

## Fonctionnement publié

Les administrateurs et collaborateurs peuvent créer un sondage de séance depuis une conversation. Le formulaire existant est partagé avec la rubrique Sondages et conserve le groupe de la conversation. Le sondage simple reste réservé à l’administrateur.

Les clients et collaborateurs approuvés voient les noms des autres groupes dans les conversations, sans leurs membres, descriptions ou contenus privés. Ils peuvent envoyer une seule demande par groupe, y compris après un refus. La contrainte unique PostgreSQL et les verrous transactionnels protègent aussi les soumissions simultanées. L’administrateur accepte ou refuse dans Gestion des groupes ; seule l’acceptation ajoute l’appartenance et émet l’événement existant de mise à jour d’accès.

Conformément à la précision du propriétaire, les règles existantes d’inscription, d’activation, d’approbation des comptes et d’affectation au Général sont conservées. Aucun changement d’authentification, de secret, de rôle, de configuration mobile protégée ou d’approbation de compte.

## Sauvegarde et migration

La sauvegarde PostgreSQL 18 a été chiffrée en AES-256-GCM ; la clé est protégée par Windows DPAPI. L’archive reste hors du dépôt et de OneDrive, sous `%LOCALAPPDATA%/ChtawTeam/release-backups/de94a11d7c9bb155b29b1d60f1f900e1422ab495/`.

La restauration de cette archive dans un PostgreSQL isolé en mémoire a confirmé les nombres de lignes et empreintes des 27 tables et 81 lignes de l’instantané. La seule migration en attente, `20261112150000_group_join_requests`, a ensuite été appliquée via Prisma. Elle ajoute uniquement le type, la table, les contraintes et les index des demandes. Les empreintes des données des 27 tables préexistantes sont identiques après application. Aucun seed, reset ou remplacement de données de production.

## Vérifications

- 151 tests unitaires serveur, 137 tests d’intégration HTTP/PostgreSQL, 103 tests logiques PWA et 133 tests d’interface réussis, soit 524 tests. TypeScript, Prisma, lint des fichiers modifiés et builds de production réussis.
- Le premier essai d’intégration a signalé des adresses de fixtures en majuscules, refusées par la contrainte existante de normalisation. Les fixtures ont été corrigées ; les dix suites d’intégration ont ensuite réussi.
- Huit contrôles publics : santé HTTP 200 via Render et le proxy PWA ; profil, groupes et sondages refusés par HTTP 401 sans session sur les deux domaines.
- Six contrôles supplémentaires : les nouvelles routes de découverte, de consultation des demandes et d’envoi d’une demande refusent les appels anonymes sur les deux domaines.
- Six scénarios sur les véritables assets PWA publiés : administrateur, client et collaborateur, à 1440 et 390 pixels. Contrôle du formulaire de séance et du groupe verrouillé, demande unique depuis la liste des noms et acceptation dans l’interface admin. Aucun débordement horizontal ni erreur JavaScript.

Les scénarios navigateur utilisent des identités fictives et des réponses API entièrement interceptées, sans Service Worker pour conserver cette interception. Ils n’effectuent aucune connexion réelle ni mutation métier de production et ne constituent pas un test du fonctionnement hors ligne. Les autorisations, les refus et la concurrence ont été exercés séparément contre l’API réelle de test et PostgreSQL jetable.

La reconnexion opérateur Vercel a suivi le flux officiel du CLI, validé par le propriétaire. Les accès applicatifs et les données réelles n’ont pas été utilisés comme fixtures. Les documents historiques et fichiers privés préexistants ne font pas partie de cette livraison fonctionnelle.
