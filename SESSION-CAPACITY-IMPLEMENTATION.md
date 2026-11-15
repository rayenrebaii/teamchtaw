# Séances : choix unique et capacités

Implémentation locale du 16 novembre 2026. Aucun déploiement, aucune migration ni connexion à la base de production. Les changements préexistants du workspace sont conservés.

## Comportement livré

- NestJS/Prisma/PostgreSQL : chaque nouveau créneau reçoit une capacité entière positive et une fin calculée à début + 90 minutes. La séance n'a plus de date limite de vote. Les dates entrantes comportent un fuseau et sont converties en instants UTC par Prisma.
- PWA : titre, date et heure de Tunis, capacité par créneau. Suppression des champs de fin et de clôture. Affichage des places, de la durée et des états Ouvert/Complet/Clôturé, avec disposition adaptable aux petits écrans.
- `POST /polls/:id/votes` refuse un deuxième vote et toute sélection multiple pour une séance. `PUT /polls/:id/votes` remplace le choix ; `optionIds: []` retire le vote. Les sondages ordinaires gardent leurs règles.
- Les mutations prennent les verrous existants de groupe puis de séance (`FOR UPDATE`) et vérifient la capacité avant de supprimer l'ancien choix. Les inscriptions concurrentes, mises à jour de capacité, suppressions et pointages sont ainsi sérialisés. Un refus annule la transaction ; aucun ancien choix n'est perdu.
- Chaque requête vérifie le statut et l'heure, y compris après les lectures de capacité. Le début ferme ce créneau et les modifications d'un choix qui le concerne ; les créneaux futurs restent ouverts. Un pointage personnel, même corrigé ensuite, bloque le changement. Le pointage d'un autre étudiant ne ferme pas toute la séance.
- La clôture manuelle utilise le statut CLOSED du formulaire existant et ne peut pas être annulée en revenant à OPEN. Les restrictions d'organisation et de pointage existantes restent applicables.
- Suppression d'un créneau : effacement de ses votes, pointages, modifications historiques, notifications et rappels ; renumérotation des créneaux restants et recalcul des absences. Le dernier créneau se supprime avec la séance entière, afin de conserver la règle « une séance possède au moins un créneau ».
- Suppression complète : effacement réel, y compris pour une ancienne séance archivée, des créneaux, votes, participants, pointages, audits, message et notifications associés. Les références aux séances supprimées sont retirées des alertes ; les compteurs et alertes sont réconciliés. Une présence sur un créneau continue de primer ; au maximum une absence est comptée par séance. Les séances obligatoires continuent d'inclure les non-votants.
- Un administrateur peut supprimer les séances et créneaux d'autrui. Un collaborateur conserve uniquement l'accès à ses propres séances dans ses groupes. Aucun changement aux comptes du site vitrine, à `profiles.approved` ou à `app_config`.

## Migration préparée et données historiques

`chtaw-team-backend/prisma/migrations/20261116120000_session_capacity/migration.sql` ajoute `PollOption.capacity`, nullable pour les données historiques, avec une contrainte SQL de positivité. Aucun vote, pointage ou horaire historique n'est effacé ou réécrit. Le client Prisma a été régénéré localement.

Les nouveaux créneaux ont obligatoirement une capacité. Pour les créneaux historiques sans capacité, les nouvelles inscriptions sont bloquées jusqu'à ce que l'organisateur renseigne une capacité au moins égale au nombre actuel d'inscrits. Un étudiant peut conserver son choix existant, même à capacité atteinte, et le retirer avant fermeture et pointage.

**Décision métier encore nécessaire : anciens votes multiples.** Ils restent visibles, inchangés et non modifiables par l'étudiant. Il faut décider avec les personnes concernées quel choix conserver, ou conserver la séance comme historique et publier une nouvelle séance. Aucune priorité arbitraire (premier vote, première date, ordre des options) n'est appliquée et aucun script de réduction automatique n'est fourni. La suppression explicite d'un créneau reste possible avec confirmation et efface les inscriptions correspondantes.

Les durées historiques connues sont conservées lors des modifications de titre, statut ou capacité ; une durée différente apparaît comme historique dans la carte. Les anciennes durées inconnues ne sont pas inventées dans les calculs de présence. La politique de reprise des séances historiques encore actives exige donc une décision métier si leur durée doit changer. Les nouvelles séances et les nouveaux horaires sont toujours calculés sur 90 minutes. Les anciennes dates limites ne pilotent plus les votes de séance : fermeture par créneau ou statut CLOSED.

Avant une future mise en service, inventorier les capacités manquantes et les choix multiples sur une copie des données, définir les capacités et arrêter la politique historique ci-dessus. La migration doit précéder le backend utilisant le nouveau client Prisma. Ce document n'autorise pas de déploiement.

## Vérifications

- Backend : 167 tests unitaires ; 149 tests d'intégration réels dans un PostgreSQL Docker jetable, dont concurrence sur la dernière place, changements atomiques, fermetures, permissions et suppressions/recalculs.
- PWA : 113 tests fonctionnels et 175 tests d'interface, dont choix unique, retrait, capacité, créneaux fermés, formulaires et confirmations.
- PWA reliée à NestJS, PostgreSQL et Socket.IO : 14 tests d'intégration passés via `npm.cmd run test:frontend:isolated`.
- Migration sur données préexistantes : conservation des anciennes lignes, d'un bulletin à deux choix et de ses présences/absences ; contrôle de la contrainte SQL positive. Test passé via `npm.cmd run test:migration`.
- TypeScript backend/PWA et builds locaux backend/PWA : passés avec environnement nettoyé et protection contre la lecture des credentials et `.env`.
- Lint PWA, sources backend et tests backend modifiés : passé. Le lint global backend rencontre une erreur préexistante dans le fichier non suivi `test/security-rotation.emulator.ts:33` (`@typescript-eslint/no-require-imports`). Ce fichier n'a pas été modifié.

Les conteneurs de tests sont arrêtés et conservés par le runner officiel ; aucun volume ni sauvegarde existante n'est supprimé.
