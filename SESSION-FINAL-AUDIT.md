# Audit final des séances de Chtaw Team

Date : 11 novembre 2026. Audit du code local, sans déploiement ni accès aux données de production. Les modifications déjà présentes avant l'audit ont été conservées. Aucune réécriture d'architecture ou d'historique Git.

**Résultat des dix contrôles demandés**

| N° | Contrôle | Résultat et preuve |
|---|---|---|
| 1 | Admin : tous les groupes sans affectation | Corrigé. Accès HTTP, listes de groupes et de sondages, listes de ses propres séances, notifications personnelles et mises à jour du store. Test avec deux admins sans aucune affectation aux groupes de test. Accès et livraison Socket.IO vérifiés ; collaborateur non affecté toujours refusé. |
| 2 | Modification, annulation et présence limitées à l'organisateur | Conforme. Matrice de deux admins et deux collaborateurs : modification, annulation, lecture du pointage, enregistrement, confirmation d'absence, participants et retrait de créneau refusés aux autres organisateurs. Aucun contournement lié au rôle ADMIN. |
| 3 | Admin : suppression des séances des collaborateurs dans tous les groupes | Conforme après correction de l'accès aux groupes. Suppression autorisée sans affectation, mais toujours bloquée par les délais ou une présence incomplète. |
| 4 | Collaborateur : suppression de ses seules séances | Conforme. Les tentatives sur les séances d'autrui sont refusées côté serveur. |
| 5 | Dates et chevauchements | Corrigé pour les fins fournies et les chevauchements internes. Intervalles entre séances contrôlés dans un même groupe pour tous les organisateurs, sous verrou transactionnel. Créations concurrentes : un succès et un refus. Créneaux consécutifs et mêmes horaires dans deux groupes autorisés. Limite du mode historique sans heure de fin détaillée ci-dessous. |
| 6 | Une présence suffit pour toute la séance | Conforme. PRESENT sur un seul créneau prime sur les autres statuts ; testé pour le suivi obligatoire et historique. |
| 7 | Une absence maximum par étudiant et séance | Conforme. Comptage par participant ou vote de séance, sans incrément par créneau. Les votes des séances obligatoires ne sont pas ajoutés au compteur historique. |
| 8 | Corrections, compteurs et signalements | Conforme. Trois séances absentes produisent un total de trois ; une correction PRESENT ramène le total à deux et résout le signalement ; une nouvelle correction ABSENT rétablit le seuil sans doublon de signalement actif. Les tests existants vérifient également les compteurs globaux et les conflits de versions. |
| 9 | Archives conservées et protégées des opérations sur les séances | Corrigé pour une requête attendant un verrou. Relecture de l'état archivé après acquisition du verrou du groupe. Modification, pointage, changement de participant, confirmation d'absence, retrait de créneau et nouvelle suppression refusés sur une archive. L'historique et les compteurs restent disponibles. Exception voulue : suppression définitive d'un compte, décrite ci-dessous. |
| 10 | Autorisations backend | Conforme. Contrôles HTTP et Socket.IO, session valide, statut, rôle réel en base, appartenance pour les non-admins et propriété des séances. Les boutons de l'interface ne constituent pas la protection. |

**Défauts identifiés et corrections limitées**

1. L'affectation à un groupe était encore obligatoire pour l'admin, y compris dans des filtres de listes. Le backend utilise maintenant le rôle réel pour l'accès global, tout en conservant l'exigence de propriété pour les opérations sur une séance. Le store accepte les mises à jour des groupes accessibles à l'admin même sans affectation.
2. L'état archivé était lu avant l'attente du verrou du groupe : une requête déjà en attente pouvait continuer après un archivage concurrent. Le contrôle central relit désormais cet état après le verrou. Une régression unitaire reproduit précisément cette séquence.
3. Deux créneaux se chevauchant au sein d'une même séance étaient acceptés. La validation contrôle désormais ces intervalles et conserve l'autorisation des créneaux consécutifs.
4. En mode historique, des heures de fin fournies pouvaient être incohérentes ou incomplètes. Elles sont désormais validées. Lors d'une modification, ces heures pouvaient aussi être ignorées et remplacées par NULL : elles sont maintenant comparées et enregistrées.
5. La suppression définitive d'un collaborateur effaçait bien ses séances, mais pouvait laisser le compteur global d'autres étudiants inchangé. Un test réel a reproduit un compteur de deux absences au lieu d'une. La suppression recalcule désormais les compteurs et signalements des étudiants encore présents, sous verrous ordonnés, en conservant leurs séances chez les autres organisateurs.

Cinq assertions de régression ont d'abord reproduit les défauts d'accès, d'archivage et de validation. Un test supplémentaire a ensuite reproduit le compteur erroné après suppression d'un collaborateur. Les corrections réutilisent le calcul métier existant ; la formule de présence, le seuil de trois absences, les votes ordinaires et l'architecture restent inchangés.

**Suppression d'un compte : règle explicitement demandée**

La conservation des présences s'applique à la suppression/archivage d'une séance, pas à la suppression définitive d'un utilisateur. Conformément à la précision donnée pendant l'audit :

- Supprimer définitivement un étudiant efface son compte, ses participations, votes, pointages, historiques de présence et compteurs associés, y compris dans les archives.
- Supprimer définitivement un collaborateur efface aussi les séances dont il est l'auteur, y compris leurs archives. Les règles existantes de suppression des comptes administrateurs restent inchangées.
- Le blocage temporairement envisagé pour les comptes liés à des archives a été retiré. L'effacement définitif reste autorisé ; seul le recalcul des compteurs des autres étudiants est corrigé.
- Un test PostgreSQL vérifie l'effacement des données de l'étudiant puis des séances du collaborateur, ainsi que le recalcul des totaux d'un étudiant restant et la conservation de sa séance chez un autre organisateur. La suppression d'un groupe contenant un historique de présence reste, elle, refusée selon la protection existante.

**Règles préservées**

La suppression anticipée reste possible jusqu'à deux heures avant le premier créneau, sans pointage enregistré. Ensuite, il faut attendre la fin de tous les créneaux et un résultat final validé pour chaque étudiant concerné. La suppression d'une séance terminée nettoie les données de conversation et archive les présences. Annulation et retrait de créneau gardent leur limite de deux heures. Un étudiant non votant n'est pas automatiquement absent.

**Tests et vérifications**

| Commande / vérification | Résultat |
|---|---|
| Backend : `npm.cmd test` | 141 tests réussis, 13 suites. |
| Backend : `npm.cmd run test:isolated` | 132 tests réussis, 9 suites, y compris l'effacement des comptes et le recalcul des compteurs des autres étudiants. |
| PWA : `npm.cmd test` | 103 tests unitaires et 116 tests d'interface réussis. |
| Backend : `npm.cmd run test:frontend:isolated` | 14 tests réussis : services frontend réels, API NestJS, PostgreSQL et Socket.IO. |
| TypeScript backend et PWA | Vérifications réussies avec l'environnement de test filtré. |
| `git diff --check` | Aucun défaut d'espacement détecté. |

Résultat final : **506 tests réussis, aucun test encore en échec**. Le test ayant reproduit le compteur erroné après suppression d'un collaborateur passe après correction.

Les intégrations utilisent des bases PostgreSQL nouvellement créées dans des conteneurs jetables. Les identités sont des fixtures autorisées ; leurs jetons proviennent des routes HTTP de connexion. Aucun JWT de production n'est fabriqué, aucune base existante n'est réutilisée, aucun secret de production n'est lu. Les conteneurs de test sont arrêtés et conservés par le runner.

Les échecs intermédiaires autres que les régressions reproduites concernaient des fixtures : collaborateurs non activés, puis un créneau de test non commencé. Les fixtures ont été corrigées sans affaiblir l'authentification ou autoriser les pointages futurs. Un ancien test d'annulation après pointage a été aligné sur la règle déjà validée : refus et conservation de la présence.

**Limites et portée**

- Pour préserver le fonctionnement historique, le mode `mandatoryAttendance: false` accepte toujours des créneaux sans heure de fin. Les fins fournies sont vérifiées, mais aucun intervalle complet ne peut être déduit d'une fin absente. La suppression après séance reste bloquée si la fin d'un créneau est inconnue. Aucune date historique n'a été inventée ou modifiée.
- Des avertissements de dépréciation du pilote `pg` apparaissent pendant les intégrations ; ils ne font pas échouer les tests. Ce point de maintenance n'a pas entraîné de changement de dépendances dans cet audit.
- Audit de code et tests automatisés locaux : pas d'audit des données réelles, pas de test de charge, pas de nouvelle recette visuelle manuelle.
- Aucune migration supplémentaire n'a été créée pour cet audit. La migration d'archivage déjà présente avant l'audit reste un prérequis du futur déploiement. Aucune migration n'a été appliquée en production.
