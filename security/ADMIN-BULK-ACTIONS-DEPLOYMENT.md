# Actions groupées et dialogue des demandes d’adhésion

12 novembre 2026, Africa/Tunis. Suite des améliorations administrateur et de la publication de la journée demandées par le propriétaire.

- Commit applicatif : `9b1e9922075961f1a4cbc6b4cd7daf083a9c75f9`, poussé normalement sur `codex/collaborator-firebase-release`.
- Publication Vercel : `dpl_EQMMRSuQAHHDz84gmmEvEL3wbdHL`, observée `READY`, avec `teamchtaw-pwa.vercel.app` affecté au même commit.
- Aucun changement du backend, de son déploiement, du schéma ou des données de production. Les API et autorisations existantes sont conservées.

## Fonctionnement

Dans Membres, l’administrateur peut sélectionner plusieurs lignes, y compris entre les pages, puis accepter les clients en attente, bannir les membres approuvés ou ajouter ces membres à un groupe privé. Les administrateurs et les invitations de collaborateurs en attente sont exclus des actions inapplicables. Le bannissement conserve la confirmation explicite de suppression définitive déjà existante. Le groupe Général n’est pas une destination manuelle.

Chaque action affiche les membres réellement concernés avant confirmation. Les appels utilisent les endpoints individuels existants, avec une seule actualisation finale. Un succès retire l’élément de la sélection ; un échec conserve sa sélection et affiche son erreur, sans répéter les opérations déjà réussies. Les appels restants cessent si la session ou le rôle administrateur change.

Dans Groupes, le bouton Demandes d’adhésion se trouve dans l’en-tête. Il ouvre une boîte de dialogue avec un tableau paginé de dix demandes, des filtres combinables par nom/prénom, e-mail et rôle, une sélection multiple et les actions accepter/refuser. La liste n’est plus affichée sous le tableau des groupes.

La sélection de page reste accessible en mode cartes sur téléphone. La sélection est conservée lors d’un changement de page et effacée lors d’un changement de filtre. Les états de sélection partielle sont accessibles au clavier et aux lecteurs d’écran.

## Vérifications

- 143 tests d’interface et 105 tests logiques PWA réussis, soit 248 tests. Les nouveaux cas couvrent notamment les filtres combinés, la pagination, les invitations protégées, les sélections sur plusieurs pages, les échecs partiels, les confirmations et la prévention des doubles envois.
- TypeScript, lint des fichiers modifiés et compilation de production réussis. Les dix tests concernés ont été relancés après la correction mobile de sélection de page.
- Recette navigateur locale puis sur les véritables assets publiés à 1440 et 390 pixels : ouverture du dialogue depuis l’en-tête, pagination, rôle/e-mail, sélection et acceptation, sélection de membres, confirmation de bannissement annulée et affectation au groupe privé.
- Aucun débordement horizontal ni erreur JavaScript sur ces parcours ; captures locales inspectées.

Toutes les requêtes métier et WebSockets des recettes navigateur sont interceptés et utilisent des identités fictives. Aucun compte réel n’a été connecté, banni, accepté ou ajouté à un groupe pendant la vérification de production. Ces contrôles ne constituent pas des mutations réelles sur les comptes du propriétaire.
