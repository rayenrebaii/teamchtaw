# Établissements — implémentation locale

## Périmètre

CRUD indépendant dans la PWA et le backend NestJS. Aucun déploiement, accès à la base de production ou changement des règles d'authentification. Les autres modifications locales préexistantes sont conservées.

Le modèle Prisma `Establishment` contient uniquement `id` (UUID généré selon la convention existante) et `name` (nom du lycée, obligatoire, trim, 120 caractères maximum). Aucun horodatage, adresse, téléphone ou lien vers les utilisateurs, groupes ou séances.

## Backend

Module `src/establishments`, enregistré dans `AppModule`.

| Route | Comportement |
| --- | --- |
| GET `/api/v1/admin/establishments` | Liste ordonnée par nom, puis id |
| GET `/api/v1/admin/establishments/:id` | Lecture individuelle |
| POST `/api/v1/admin/establishments` | Création avec `{ "name": "Lycée…" }`, HTTP 201 |
| PATCH `/api/v1/admin/establishments/:id` | Renommage avec le même DTO obligatoire |
| DELETE `/api/v1/admin/establishments/:id` | Suppression, HTTP 204 |

Toutes les routes utilisent les guards existants et `@Admin()` sur le contrôleur. Chaque opération revérifie aussi la session, l'approbation et le rôle réel via `AccessService.actor` dans sa transaction. Les noms vides, null, non textuels, trop longs et les champs supplémentaires sont rejetés (400). Les doublons sont refusés (409), les identifiants inconnus donnent 404 et les identifiants mal formés 400.

## Migration

`chtaw-team-backend/prisma/migrations/20261116150000_establishments/migration.sql` crée seulement la nouvelle table, une contrainte de nom non vide/sans espaces de bord et un index unique SQL sur `lower(name)`. Cet index d'expression protège aussi les écritures concurrentes sans ajouter de colonne de normalisation. Il est conservé dans la migration SQL, Prisma ne le représentant pas par un champ `@unique`.

Les migrations existantes ne sont pas modifiées. La migration a été appliquée uniquement par le runner de tests à de nouvelles bases PostgreSQL jetables. Aucun seed, reset ou migration d'une base existante n'a été exécuté. Les conteneurs de test ont été arrêtés et conservés par le runner.

Pour une publication future autorisée : régénérer le client Prisma pendant le build backend, appliquer cette migration additive via la procédure de publication existante, puis publier le backend et la PWA. Cette opération n'est pas réalisée ici.

## PWA et langues

Page `/admin/establishments`, entrée « Établissements » / « Schools » avec icône dans la navigation latérale et le menu « Plus » mobile. Service HTTP dédié réutilisant le client d'API et la session existants.

Présentation harmonisée avec Membres : carte du total réel des lycées, panneau avec compteur et en-tête de tableau, identités avec icône et mêmes styles de boutons. Le tableau devient une liste de cartes sur petit écran. Aucun statut métier supplémentaire n'est ajouté.

Ordre de la navigation ADMIN : Conversations, Membres, Calendrier, Sondages, Collaborateurs, Présences, Groupes, Établissements. Sur mobile, les quatre premières entrées restent visibles et les suivantes sont dans « Plus ». Les navigations USER et COLLABORATOR conservent leur ordre.

Liste avec nom et actions, formulaire à un champ, confirmation avant suppression. États chargement, vide, erreur avec nouvel essai, erreurs de formulaire et confirmations de réussite. Les dialogues restent ouverts et les données conservées en cas d'échec. Les noms métier ne sont pas traduits. Tous les libellés, confirmations et erreurs spécifiques sont traduits en anglais via le mécanisme existant.

## Vérifications

- Backend : 179 tests unitaires et 164 tests d'intégration réussis, dont 12 nouveaux tests unitaires et 15 nouvelles intégrations. Connexion HTTP officielle de comptes jetables ; aucun JWT fabriqué à partir d'une identité ou clé existante.
- CRUD réel, trim, absence de champs supplémentaires, noms invalides, doublons de casse et accentuation, renommage sans auto-collision, concurrence, protection de l'index SQL, UUID/404, refus de toutes les routes pour USER/COLLABORATOR/PENDING/anonyme et refus après retrait du rôle ADMIN. Les opérations CRUD préservent les comptes des données métier existantes dans la base de test.
- PWA : 113 tests fonctionnels réussis ; 175 tests UI couverts, avec mise à jour des deux assertions de navigation FR/EN puis relance réussie des 18 tests du fichier concerné.
- Neuf scénarios navigateur Edge réussis : CRUD en FR/EN, clair/sombre, 390/1440 px ; espaces vides, doublon, annulation de suppression, suppression refusée puis nouvel essai, chargement, erreur de liste et nouvel essai. Le trafic API de ces scénarios visuels est simulé ; les intégrations backend ci-dessus utilisent PostgreSQL réel isolé.
- Captures de liste et dialogue examinées, sans débordement horizontal. Fichiers ignorés par Git dans `chtaw-team-pwa/.test-browser-results/establishments-{fr|en}-{light|dark}-{390|1440}.png` et variantes `-duplicate.png`.
- TypeScript et builds backend/PWA réussis. Lint PWA et lint ciblé de tous les fichiers modifiés réussis.
- Limite connue : le lint global backend échoue sur le `require()` préexistant dans le fichier non suivi `test/security-rotation.emulator.ts:33` ; ce fichier est laissé intact. Aucun test sur téléphone physique.
