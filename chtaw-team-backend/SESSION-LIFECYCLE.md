# Séances : horaires, suppression et conservation des présences

- Les chevauchements sont refusés dans un même groupe, quel que soit l'organisateur, à la création et lors d'un changement d'horaires. Deux créneaux consécutifs sont autorisés. Le verrou transactionnel du groupe protège aussi les créations simultanées. Une séance annulée ou supprimée ne réserve plus ses horaires.
- Les mêmes horaires sont autorisés dans deux groupes différents. Chaque séance a ses propres participants et pointages. Un étudiant inscrit dans les deux groupes possède donc deux historiques indépendants.
- L'annulation, le retrait d'un créneau et le changement des horaires sont autorisés au plus tard deux heures avant le début du premier créneau.
- La suppression anticipée est autorisée jusqu'à cette même limite, en l'absence de pointage enregistré.
- Ensuite, la suppression est bloquée jusqu'à la fin de **tous** les créneaux et la validation du résultat de présence de chaque étudiant concerné. Un premier pointage ne suffit pas. Une absence obligatoire doit être confirmée selon les règles existantes.
- Après validation, la suppression archive la séance : elle disparaît des listes actives, ses messages, notifications et rappels sont supprimés. Les bulletins de vote devenus inutiles sont supprimés pour les séances à présence obligatoire.
- Les dates, les résultats de présence et d'absence, les étudiants concernés et les traces de pointage restent conservés dans la base. Ils alimentent toujours les historiques et les compteurs. Ces données conservées occupent nécessairement de l'espace ; cette opération n'efface pas tout l'historique pour gagner de la place.
- Une séance archivée est consultable dans l'historique mais ne peut plus être modifiée ou pointée. Pour une ancienne séance sans heure de fin connue, la suppression après séance reste bloquée : le serveur ne suppose jamais que le dernier créneau est terminé.
- Exception explicite : la suppression définitive d'un utilisateur efface ses données et son historique, y compris ses présences dans des séances archivées. La suppression définitive d'un collaborateur efface aussi les séances qu'il a créées. L'archivage d'une séance ne bloque pas cette suppression de compte, réservée à l'admin.
- Après suppression d'un organisateur et de ses séances, les compteurs d'absences des autres étudiants concernés sont recalculés. Leurs données dans les séances des autres organisateurs restent conservées.

Exemple : une séance avec lundi 8 h–10 h et mardi 8 h–10 h peut être supprimée avant lundi 6 h, ou à partir de mardi 10 h après validation des présences. Entre ces deux moments, elle reste protégée.

La migration `202611110001_session_archives` ajoute `Poll.archivedAt`. Elle doit être appliquée avant de déployer le serveur modifié. Aucun déploiement ni changement de données de production n'est effectué par ces modifications locales.
