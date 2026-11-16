# Export Excel des étudiants

Le bouton **Exporter / Export** dans la page admin Membres télécharge `chtaw-team-students.xlsx`.

- Une ligne par étudiant (`USER`), tous statuts, indépendamment des recherches, filtres et pages affichés.
- Cinq colonnes : Nom, Prénom, Email, Téléphone, Groupes (en anglais selon la langue de la PWA).
- Tous les groupes sont réunis dans la dernière cellule. Les valeurs manquantes restent vides. Les administrateurs et collaborateurs sont exclus.
- Route `GET /api/v1/admin/students/export?language=fr|en`, protégée par le rôle ADMIN et une vérification du compte/session côté service. Réponse privée sans cache.
- ExcelJS génère le véritable format XLSX côté backend uniquement. Aucun ajout au bundle frontend. Téléphones et autres valeurs sont des cellules texte, sans interprétation en formules.
- État de chargement, erreur avec possibilité de réessayer, et confirmation du téléchargement. Le téléchargement est refusé si la session change pendant sa préparation.

Vérifications : TypeScript backend/PWA, lint des fichiers modifiés, 192 tests unitaires backend, 196 tests d’intégration PostgreSQL jetable, 116 tests de logique et 175 tests UI PWA. Le test d’intégration relit les fichiers XLSX français/anglais, contrôle plus de 100 étudiants, les groupes multiples, le téléphone et les permissions anonyme/étudiant/collaborateur. Cinq scénarios Playwright vérifient téléchargement, échec/réessai, filtres sans effet sur l’export et affichage desktop/mobile en clair/sombre. Captures examinées sous `chtaw-team-pwa/.test-browser-results/students-export-*.png`.

Aucune nouvelle migration pour cet export. Il utilise le champ téléphone préparé dans la migration précédente des profils. Aucun déploiement et aucun accès à la base de production. L’erreur préexistante du lint backend global dans `test/security-rotation.emulator.ts:33` est hors périmètre.
