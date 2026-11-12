# Notifications et compteur de demandes

12 novembre 2026, Africa/Tunis.

- Commit applicatif : `b3e5dad3edbadde462c1555b8db643acc279c629`, poussé sur `codex/collaborator-firebase-release` sans réécriture d’historique.
- API Render : `dep-dbqv2jgm7kps73fkg28g`, observée `live` sur ce commit.
- PWA Vercel : `dpl_Fxig5NdsvJtAvbwfCwQVvEhnYGqw`, observée `READY`, domaine `teamchtaw-pwa.vercel.app` affecté à ce commit. Une interruption réseau au premier appel a été suivie d’un contrôle des déploiements avant relance.

## Comportement

L’ouverture utilise un nouveau `POST /notifications/:id/open` authentifié. Une transaction contrôle le destinataire, les droits et l’existence de la source, puis supprime uniquement cette notification et ses livraisons associées. Elle renvoie la destination exacte et le nouveau compteur. Message, sondage et notifications des autres destinataires sont conservés. Un échec d’autorisation ou une source indisponible conserve la notification. Les appareils connectés sont avertis après validation de la transaction. Les anciennes API de lecture restent compatibles.

La destination contient le message ou le sondage à retrouver dans la conversation ; le chat charge aussi l’historique ancien si nécessaire. Les signalements ouvrent le rapport précis. Les doubles clics et le montage React StrictMode partagent la requête en cours ; une réponse liée à un ancien compte ne déclenche aucune navigation.

Les notifications intégrées et push affichent désormais l’expéditeur, le groupe et le texte réel, ou le type et la question du sondage. Les anciennes lignes génériques sont enrichies lors de leur lecture. Les aperçus sont normalisés et bornés. Les rappels incluent la séance, l’organisateur, le créneau et l’horaire. Le push reste chiffré et respecte les préférences, la session et l’association de l’appareil.

Le Service Worker `chtaw-public-v9` ouvre une URL absolue de la même origine, focalise une fenêtre existante et ouvre une nouvelle fenêtre si celle-ci est inutilisable. Après déconnexion, l’identifiant de notification est conservé dans le parcours de connexion, avec les barrières existantes de validation du compte. Les destinations externes sont refusées. Une notification système déjà affichée par une ancienne version conserve son aperçu initial.

Dans la page Groupes de l’admin, le bouton Demandes d’adhésion affiche le total en attente, y compris zéro. Le total utilise la liste admin existante, se rafraîchit toutes les 30 secondes et au retour dans la fenêtre, et diminue après les décisions individuelles ou multiples. Les échecs restent comptés. Aucun appel admin n’est effectué pour les clients ou collaborateurs ; les réponses d’un ancien compte sont ignorées. Le dialogue reste fermé par défaut, avec filtres et pagination inchangés.

Aucune migration, modification de secrets, réécriture de l’historique Git, modification des approbations ou de la configuration mobile protégée.

## Vérifications

- 157 tests unitaires backend, 148 intégrations PostgreSQL/HTTP isolées, 113 tests logiques PWA et 171 tests d’interface : 589 tests réussis. Builds backend/PWA, TypeScript et lint ciblé réussis.
- Intégrations : suppression limitée au destinataire, source conservée, livraisons supprimées, absence de régénération, ancien aperçu enrichi en français/anglais, sondage de séance, source supprimée et appartenance retirée.
- Interface : doubles clics, StrictMode, échec puis nouvelle tentative, changement de compte, absence du titre en double, conservation du contenu réel en anglais, total avant ouverture, acceptation/refus multiples, échec partiel, actualisation, zéro et réponse d’un ancien admin.
- Tests du Service Worker en environnement simulé : titre et texte réels, association de l’appareil, ouverture d’une nouvelle fenêtre, navigation/focus d’une fenêtre existante et repli si elle est inutilisable. Aucun test de notification OS sur un téléphone physique.
- Six parcours navigateur locaux à 1440/390 pixels pour les rôles ADMIN, USER et COLLABORATOR : message ancien retrouvé, sondage précis, notification supprimée, entrée système avec session restaurée et compteur admin de 1 à 0. Aucun débordement ni erreur JavaScript. Captures ordinateur et mobile inspectées.
- Les six mêmes parcours ont réussi sur les assets du domaine de production après affectation du nouveau déploiement. Huit contrôles publics de santé et de refus d’accès sans session ont réussi sur Render et le proxy PWA.

Les tests navigateur interceptent toutes les API métier et WebSockets avec des identités fictives ; ils n’envoient aucune mutation métier en production. Les intégrations utilisent leur propre serveur et base PostgreSQL temporaires, avec connexion HTTP normale.
