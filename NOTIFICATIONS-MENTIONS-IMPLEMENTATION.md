# Notifications de début et mentions

Demande : corriger les notifications de séance, retirer automatiquement une notification ouverte et ajouter `@tous` / la sélection de membres par nom et photo, pour ADMIN, USER et COLLABORATOR. Publication en production autorisée par la demande.

## Comportement

- Nouveau rappel `SESSION_START` pour les étudiants ayant réservé le créneau et appartenant encore à un groupe de la séance. La confirmation automatique à l'heure de début est reconnue, sans exiger `validatedAt`. Les rappels préalables des créneaux validés sont conservés.
- Planification persistante et verrouillage PostgreSQL : un rappel par créneau, étudiant, type et horaire. Rattrapage limité à 15 minutes après le début et arrêt à la fin du créneau. Les séances annulées/archivées, anciens horaires, non-votants, anciens membres et préférences désactivées sont exclus. Le départ d'un groupe partagé ne supprime pas l'accès depuis un autre groupe encore autorisé.
- `@` affiche les membres du groupe avec leur avatar existant ; recherche insensible aux accents, souris/tactile et clavier (flèches, Entrée/Tab, Échap). `@tous` vise les autres membres approuvés du groupe. Les mentions individuelles sont transmises par identifiant et validées côté serveur. Les préférences de notification restent respectées.
- Une seule notification par message et destinataire ; une mention remplace le type MESSAGE par MENTION pour les destinataires concernés. Aucun ajout de droits. Les destinataires hors groupe sont refusés.
- Le parcours existant `POST /notifications/:id/open` résout la source puis retire la notification en transaction et actualise les autres appareils. Recette étendue aux mentions et à tous les rôles. Un échec d'ouverture conserve la notification pour réessayer.

## Schéma

Migration additive `20261118120000_mentions_session_start` : `Message.mentionIds` (UUID[], défaut vide), extension des contraintes de types de notifications/rappels. Compatible avec l'ancien code. Ne pas annuler la publication par suppression de données.

L'outil opérateur `security/deploy-notifications-schema.cjs` exige un commit exact, refuse les migrations inattendues, sauvegarde avec AES-256-GCM/DPAPI hors OneDrive, vérifie la restauration dans PostgreSQL 18 isolé puis applique uniquement cette migration avec Prisma. Il compare les anciennes lignes avant/après en excluant la nouvelle colonne vide.

## Validation locale

- Backend : build et lint des changements, 207 tests unitaires réussis.
- Intégrations : 212 scénarios sur PostgreSQL jetable ; le passage global a révélé une attente historique de deux rappels. Après adaptation au troisième rappel, les sept scénarios de séances partagées ont tous réussi. Les 28 scénarios de notifications passent, dont démarrage automatique, concurrence, groupe secondaire, expiration, mentions par les trois rôles et ouverture/suppression.
- PWA : build de production, TypeScript/lint, 116 tests de logique et 189 tests d'interface réussis.
- Edge : 12 scénarios sur le build local, trois rôles × 390/1440 px × clair FR/sombre EN. Sélection avec photo, clavier, envoi, ouverture/suppression puis retour à la liste. Aucun débordement ni erreur JavaScript. Captures ordinateur/mobile inspectées.
- Les recettes navigateur interceptent les API métier et les WebSockets avec des identités fictives. Les intégrations utilisent les connexions HTTP normales sur bases jetables. Aucun compte ou contenu réel n'est créé pour ces tests. Pas de test sur téléphone physique ; les notifications système nécessitent une autorisation et un abonnement Push sur l'appareil.

Les preuves de publication sont consignées séparément après déploiement.

## Ex?cution en production

Inspection op?rateur en lecture seule : API Render sur le forfait `free`, Push configur?, mode production, fuseau Africa/Tunis. Render Free se met en veille apr?s 15 minutes sans trafic (https://render.com/docs/free#spinning-down-on-idle) : les timers internes ne constituent donc pas un ordonnanceur permanent. Le rattrapage de 15 minutes r?duit les pertes apr?s un red?marrage, mais ne garantit pas un rappel pendant une veille prolong?e. Le passage ? une instance permanente payante exige une autorisation de facturation distincte ; cette livraison ne change pas le forfait.
