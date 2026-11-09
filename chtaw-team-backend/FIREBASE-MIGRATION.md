# Firebase Authentication — Chtaw Team

Rapport du 9 novembre 2026 : configuration et validation locale terminées ;
publication Render/Vercel et tests finaux de récupération en production en cours.

## Architecture

La PWA utilise les SDK officiels Firebase pour inscription, connexion, vérification
et récupération du mot de passe. NestJS vérifie les ID tokens avec Firebase Admin
(`checkRevoked=true`) puis relit l’identité. Les rôles, approbations et données
métier restent dans PostgreSQL/Neon. Ni Firestore, ni Resend, ni SMTP ne sont utilisés.

`POST /api/v1/auth/firebase` retrouve un UID explicitement migré ou crée un USER
PENDING. Il n’associe jamais un ancien compte par simple correspondance d’e-mail.
Le frontend ne décide jamais du rôle, de l’approbation ou de la vérification.

Les sessions NestJS sont conservées : access token en mémoire, refresh navigateur
HttpOnly. Chaque session Firebase mémorise son `auth_time` vérifié. Chaque résolution
et chaque refresh contrôle la désactivation et `tokensValidAfterTime` de Firebase.
Un reset Firebase invalide les anciennes sessions NestJS. Les JWT dépourvus de liaison
Firebase sont refusés après bascule. Les fonctionnalités protégées exigent APPROVED
et un e-mail actuellement vérifié ; `auth/me` et logout restent accessibles en attente.
Socket.IO et l’envoi push appliquent également les contrôles. Le champ PostgreSQL
`emailVerified` est un instantané d’affichage synchronisé, pas l’autorité de sécurité.

Pour les PWA déjà installées, `/auth/login` reste compatible : en mode Firebase,
il vérifie le mot de passe auprès de l’API officielle Firebase puis suit exactement
la même validation d’ID token. Il ne consulte jamais l’ancien hash Argon2 dans ce mode.
L’ancien endpoint d’inscription est désactivé en mode Firebase.

## Projet et configuration

Projet dédié `chtaw-team-auth-2026`, Web App « Chtaw Team PWA », Authentication
standard (`FIREBASE_AUTH`), sans facturation activée. Email/Password, protection
contre l’énumération, e-mails français et mots de passe de 12 à 128 caractères sont
configurés. Aucun service payant ni domaine n’a été acheté.

Domaines autorisés : domaines Firebase du projet, localhost, 127.0.0.1 et
teamchtaw-pwa.vercel.app. Le compte de service Render n’a que
`roles/firebaseauth.viewer`. Sa clé privée est limitée aux secrets backend et aux
fichiers privés ignorés par Git ; il ne peut pas créer ni modifier les identités.

Render : AUTH_PROVIDER=firebase, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
FIREBASE_PRIVATE_KEY, FIREBASE_WEB_API_KEY. Cette dernière clé est publique et sert
uniquement à la connexion compatible. Les autres variables existantes sont préservées.
Node >=22 est requis. Sans indicateur, le code conserve le mode legacy.

Vercel PWA : NEXT_PUBLIC_AUTH_PROVIDER=firebase, NEXT_PUBLIC_FIREBASE_API_KEY,
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID,
NEXT_PUBLIC_FIREBASE_APP_ID. Aucun secret Admin n’a le préfixe NEXT_PUBLIC.
Les variables publiques demandent un nouveau build. Le CSP autorise les deux API
HTTPS d’authentification Firebase.

Pages ajoutées : /verify-email, /forgot-password, /auth/action. Les routes existantes
de connexion, inscription et attente d’approbation sont conservées. Les liens invalides
ou expirés proposent une récupération ; le reset affiche une réponse générique et
n’approuve jamais le compte. Firebase applique ses limites anti-abus, avec un délai
supplémentaire dans l’interface.

Spark : 1 000 e-mails de vérification et 150 e-mails de reset par jour actuellement,
avec limites anti-abus supplémentaires. Source : https://firebase.google.com/docs/auth/limits

## Migration et décisions validées

Audit initial Neon en lecture seule : 6 comptes (1 ADMIN APPROVED, 4 USER APPROVED,
1 USER PENDING), aucun doublon d’e-mail normalisé, aucun fournisseur Google ni rôle
SUPER_ADMIN. Les hashes Argon2id utilisent 65536 KiB, au-delà de la limite d’import
Argon2 Firebase documentée. Aucun hash n’a été rétrogradé ou importé artificiellement.
Source : https://firebase.google.com/docs/auth/admin/import-users

Deux sauvegardes PostgreSQL 18 ont été créées et leurs catalogues vérifiés :
`.deployment-private/firebase-pre-migration.dump` (422 708 octets) et
`.deployment-private/firebase-pre-account-cleanup.dump` (423 550 octets).
Ces archives privées ne doivent pas être publiées.

Migration additive appliquée à Neon : `202611090001_firebase_auth` ajoute
User.firebaseUid unique nullable, User.emailVerified=false et
RefreshSession.firebaseAuthTime nullable. Elle ne supprime ni n’approuve aucun compte.

Le propriétaire a demandé ensuite de conserver le compte existant
mohamadrayenrebai@gmail.com, de le promouvoir administrateur et d’en configurer le
mot de passe. Son identifiant et ses données ont été conservés. Les nouveaux
identifiants ont été testés auprès de Firebase et de l’API actuelle ; les anciennes
sessions ont été révoquées. L’e-mail de vérification a été réellement reçu et le
propriétaire a confirmé le lien. Firebase et le backend ont confirmé la vérification
et l’accès administrateur.

Après présentation de l’impact et confirmation explicite distincte, les 5 autres
comptes ont été supprimés avec 11 messages, 1 sondage, 2 médias, 2 votes et 3 marques
de présence. L’identité Firebase de l’ancien administrateur a aussi été supprimée.
Il reste l’unique administrateur demandé et les 3 groupes. Ces suppressions remplacent
la consigne initiale de préservation uniquement pour le périmètre autorisé. Les
sauvegardes sont conservées.

## Validation

- Backend : 101 tests unitaires et 96 tests d’intégration réussis sur une nouvelle
  base PostgreSQL isolée. Firebase y est simulé ; migrations, HTTP, double validation,
  approbation administrateur et Socket.IO sont couverts.
- PWA : 164 tests réussis, incluant reset générique, action invalide, vérification
  expirée, confirmation et nouveau mot de passe.
- TypeScript et builds NestJS/Next.js réussis, y compris build Next.js en mode Firebase.
  Lint sans erreur ; un avertissement React préexistant subsiste dans Shell.
- npm audit --omit=dev : zéro vulnérabilité de production après correctifs ciblés
  gRPC/glob. Les outils de développement conservent 3 avis faibles et 22 modérés côté
  backend, et 8 modérés côté PWA.
- Clé backend en lecture seule testée réellement ; réception et vérification de
  l’e-mail administrateur confirmées.
- Inscription et récupération réelles sur les URLs finales restent à vérifier après
  publication ; ne pas déclarer ces validations achevées avant leur exécution.

## Publication et retour arrière

Render Free, Vercel et Neon sont conservés. Le site vitrine n’est pas lié à Git et
son déploiement ne doit pas changer. Préparer la PWA sans attribution automatique
du domaine, puis la promouvoir après validation du backend. Ne pas réécrire l’historique Git.

Après les resets Firebase, ne pas réactiver aveuglément les anciens hashes, devenus
potentiellement obsolètes. Préférer une version Firebase connue fonctionnelle. Une
restauration des données supprimées doit être ciblée et validée séparément ; ne jamais
réinitialiser Neon.
