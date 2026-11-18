# Agents de l’administrateur principal

La page `/admin/administrators` permet d’inviter un agent par e-mail avec le
même parcours d’activation que les collaborateurs (Firebase ou authentification
historique). L’agent a le rôle `ADMIN`, avec `isInvitedAdmin = true` et un
`principalAdminId` déterminé par le serveur. Une invitation envoyée par un agent
reste rattachée au principal, sans créer de chaîne de propriétaires.

Les séances, sondages, messages et photos créés par l’agent appartiennent au
principal. L’agent voit le calendrier du principal et ses compteurs d’absence.
Les corrections de présence conservent l’identité réelle de l’agent dans leur
historique.

Les administrateurs existants restent protégés : ils ne peuvent être supprimés,
désactivés ou réinitialisés par les routes de gestion des agents. Un agent ne
peut pas se supprimer lui-même. Retirer un agent désactive son compte, invalide
ses invitations et révoque ses sessions ; cela conserve les créations partagées
et les historiques de présence. Le compte conservé pour l’audit ne figure plus
dans les annuaires actifs ; son adresse e-mail reste réservée.

## Mise en service

Appliquer la migration `20261118160000_invited_administrators` avant de déployer
le backend et la PWA. Régénérer Prisma pendant la préparation du backend.
Conserver la configuration d’envoi des invitations existante. Cette modification
ne déploie rien et ne modifie pas les identités de production.

## Vérification

- `npm test` dans le backend et la PWA.
- `npm run build:local` dans le backend et la PWA.
- `npm run test:isolated -- --collaborator` dans le backend : scénarios HTTP avec
  connexion normale, activation unique, attribution au principal et révocation.
  Ce test nécessite Docker avec l’image PostgreSQL de test disponible ; aucune
  base existante ne sert de solution de repli.
