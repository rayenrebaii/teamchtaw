# Publication des agents administratifs et du dashboard

18 novembre 2026, Africa/Tunis. Publication demandée explicitement par le
propriétaire, qui a confirmé le périmètre « Les agents et le dashboard ».

Version applicative : `2d80a2e68a635cd4735a51434f3827628e999261`.
Push normal sur `codex/collaborator-firebase-release`, sans réécriture
d’historique. Les changements locaux préexistants de sécurité et de récupération
ne font pas partie du commit.

## Sauvegarde et migration

Sauvegarde PostgreSQL cohérente chiffrée en AES-256-GCM, clé protégée par Windows
DPAPI, conservée hors OneDrive sous
`%LOCALAPPDATA%/ChtawTeam/release-backups/2d80a2e68a635cd4735a51434f3827628e999261/20261118160000_invited_administrators/verification-1/`.

L’archive chiffrée a été redéchiffrée en mémoire et restaurée dans un PostgreSQL
Docker isolé en mémoire : empreintes et effectifs identiques pour les 32 tables
et 345 lignes de l’instantané. Les sauvegardes existantes sont conservées.

La seule migration en attente était
`20261118160000_invited_administrators`. Elle est appliquée. La comparaison
avant/après confirme `existingDataUnchanged: true` pour les colonnes
préexistantes des 32 tables et `changedExistingAdminFlags: 0` : les comptes
existants ne deviennent pas agents. Aucun seed, reset ou restauration de
production.

## Validation avant publication

- 232 tests unitaires backend, 116 tests de logique PWA et 208 tests UI réussis.
- Neuf scénarios HTTP analytiques et 29 scénarios collaborateurs/agents réussis
  sur PostgreSQL Docker jetable.
- Huit scénarios Firebase Emulator/PostgreSQL réussis, incluant invitation
  d’agent, activation, accès analytique, protection du principal et révocation de
  l’agent. Les identités sont jetables dans le projet `demo-` isolé.
- TypeScript et builds réussis. Lint frontend et code backend modifié réussis ;
  deux erreurs préexistantes hors périmètre subsistent dans le lint global des
  tests backend.
- Huit scénarios navigateur locaux réussis, quatre largeurs de 320 à 1440 px,
  clair/français et sombre/anglais. Captures contrôlées.

## Publication et vérifications finales

Backend Render : `dep-dbusna0m7kps73dcmui0`, état **live**, commit exact vérifié.
PWA Vercel : `dpl_EB1SZ3QJfQdHwpQxVEckV45LyjCU`, état **READY**, commit exact
vérifié, `aliasAssigned: true` et domaine `teamchtaw-pwa.vercel.app` affecté.

URLs de production : https://teamchtaw-pwa.vercel.app et
https://teamchtaw-api.onrender.com. Les pages `/admin` et
`/admin/administrators` sont publiées avec accès authentifié administrateur.

Après activation du backend, les 14 contrôles publics API/proxy PWA réussissent :
santé 200 avec état `ok`, authentification/groupes/nouvelles routes
administratives refusés avec 401 sans session. Contrôle final du schéma :
19 migrations appliquées, aucune en attente, 32 tables métier conservées.

Après publication de la PWA, les 14 mêmes contrôles publics passent de nouveau.
Les **12 scénarios navigateur sur les assets publiés passent** : invitations et
retrait d’accès aux agents à 390/1440 px en FR/EN, puis dashboard à
320/390/768/1440 px en clair/FR et sombre/EN. Les contrôles couvrent protection du
principal, confirmation conservant les historiques, filtres, cumul, navigation
au clavier et absence de téléchargement des listes complètes de comptes et
sondages. Aucun débordement horizontal. Les API privées et WebSockets sont tous
interceptés ; ces tests d’interface ne constituent pas une connexion réelle à un
compte de production. Les parcours authentifiés ont été vérifiés dans Docker et
Firebase Emulator, sans utiliser les identités des utilisateurs.

Captures de recette sous `chtaw-team-pwa/.test-analytics-browser/release/`,
ignorées par Git. Le correctif d’origine CORS de la fixture permet la même recette
locale ou publique ; il n’altère pas l’application publiée.

Versions antérieures relevées : backend `dep-dbughsijnfac73d6359g` sur
`0d185f2c2cd997fd45b2c7052d0a3d9e08729906`, PWA
`dpl_Hyv6iFdG1AsofEsjkJQh5mJxvETd` sur
`009ed10b0e2ee9288b1dea8770ea76e425d93b66`.

Aucun compte de production n’est créé pour la recette, aucune invitation réelle
n’est envoyée. La rotation des secrets applicatifs et la procédure de récupération
préexistante restent des opérations distinctes. Seul le CLI officiel Vercel a
renouvelé son accès opérateur expiré ; les secrets applicatifs restent inchangés.

## Retour arrière

Conserver les colonnes additives et les sauvegardes. Si nécessaire, rétablir une
version applicative compatible avec l’état du schéma via les hébergeurs ; ne pas
supprimer les colonnes ou réinitialiser la base. Les agents déjà activés doivent
être désactivés explicitement avant un retour à une ancienne version qui ne
connaît pas leur rattachement au principal : ne pas faire fonctionner leurs
sessions avec une ancienne sémantique d’auteur.
