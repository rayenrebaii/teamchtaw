# Photos, établissements étudiants et téléphone tunisien

Implémentation locale, sans déploiement et sans modification de la base de production.

## Comportement

- Toute nouvelle inscription étudiante exige un établissement officiel ou une proposition « Autre », ainsi qu’un téléphone tunisien (+216 suivi de huit chiffres). La photo reste facultative. Le backend normalise le numéro, les espaces et la casse des propositions.
- Les comptes existants gardent leurs champs non renseignés et peuvent se connecter. La vérification Firebase et l’approbation administrative restent indépendantes du traitement des établissements.
- La liste publique des établissements expose uniquement `id` et `name`. Toutes les mutations d’établissements et de propositions ainsi que les affectations manuelles exigent ADMIN côté serveur.
- Les propositions équivalentes en attente sont regroupées. Accepter réutilise ou crée un établissement officiel et affecte les étudiants encore sans établissement. Une affectation manuelle antérieure est conservée. Refuser conserve les comptes et le nom déclaré non validé.
- Un établissement affecté ne peut être supprimé. Aucun établissement n’est imposé aux administrateurs et collaborateurs.
- Tous les rôles peuvent ajouter, remplacer et supprimer leur propre photo depuis Profil. L’inscription envoie sa photo après authentification, sans upload anonyme. Si cet envoi échoue, le compte est conservé et un message invite à réessayer depuis Profil.
- Le composant Avatar partagé affiche les photos dans le menu, le profil, les membres et les conversations. Sans photo ou sur échec de lecture, les initiales restent affichées. Les nouveaux libellés sont traduits en anglais.
- Le téléphone est retourné uniquement dans les réponses du compte concerné et de l’administration ; il est absent des sélecteurs partagés de membres/conversations.

## Migration préparée

`chtaw-team-backend/prisma/migrations/20261117100000_profile_photos_student_schools/migration.sql`

Migration additive : champs utilisateur facultatifs `phone`, `profilePhotoId`, `establishmentId`, `establishmentSuggestionId`, table de suggestions et table de nettoyage différé des photos. Contraintes de référence, relation réservée à USER, index unique des propositions en attente et des noms officiels normalisés. Les écritures concurrentes d’établissements/propositions sont sérialisées par verrou transactionnel PostgreSQL ; la modification de photo verrouille le compte.

Aucune donnée historique n’est remplacée ou supprimée. En cas de doublons historiques après normalisation des espaces/casse, l’index officiel bloque la migration : les noms concernés devront être examinés avant toute application réelle. Aucune fusion automatique n’est prévue.

## Stockage

Réutilisation de `MediaStorage` et du fournisseur PostgreSQL existant, vérifié sur PostgreSQL jetable avec de vrais octets d’image. Pour un hébergement Render sans disque persistant, sélectionner **`MEDIA_STORAGE=postgres`**. `MEDIA_MAX_TOTAL_BYTES` conserve sa limite existante (100 Mio par défaut, partagée avec les autres médias). Les images sont stockées en binaire dans `StoredMedia`, jamais en base64. Aucun fournisseur payant ajouté. La configuration réelle de production n’a pas été lue ni modifiée dans cette tâche.

Upload authentifié limité à 5 Mio, JPEG/PNG/WebP/GIF contrôlés par décodage réel, SVG et fichiers corrompus refusés ; orientation corrigée, métadonnées supprimées, conversion WebP avec dimension maximale de 512 pixels. Les noms sont des UUID. Les lectures sont privées, sans cache ; accès à sa photo, accès admin ou membre approuvé d’un groupe commun.

L’ancienne photo est nettoyée après l’enregistrement de la nouvelle. Une file durable retente les suppressions échouées et les uploads interrompus ; la suppression définitive d’un compte y inscrit également sa photo. Une photo encore référencée est protégée du nettoyage.

## Vérifications

- Backend : TypeScript, build local sécurisé, 192 tests unitaires, 195 tests d’intégration PostgreSQL isolés ; 7 tests sur émulateur Firebase local. Aucun test n’utilise une base de production.
- PWA : TypeScript, lint, build local sécurisé, 114 tests de logique et 175 tests UI réussis.
- Playwright : 40 scénarios réussis. Inscription avec/sans photo, numéro envoyé au format +216, choix officiel/Autre, aperçu/retrait, CRUD de photo pour les trois rôles, confirmation et initiales, fichier invalide, image inaccessible, suggestions et affectation manuelle, régression CRUD et fond animé. Largeurs 390/1440, thèmes clair/sombre, français/anglais ; réduction des animations à 320 pixels et clavier mobile simulé par réduction de hauteur. Les captures ont été examinées et sont sous `chtaw-team-pwa/.test-browser-results/`.
- Lint backend global : erreur préexistante `@typescript-eslint/no-require-imports` dans `test/security-rotation.emulator.ts:33`, fichier hors périmètre ; le lint ciblé des fichiers de cette fonctionnalité est réussi.

Limites : aucun test sur téléphone physique ni SMS de vérification du numéro ; le contrôle du téléphone est syntaxique. L’utilisation effective en production nécessite une application séparée de la migration et des déploiements backend/PWA compatibles.
