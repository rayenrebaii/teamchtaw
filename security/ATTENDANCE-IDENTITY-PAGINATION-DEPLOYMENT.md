# Présences : identité visuelle et pagination commune

18 novembre 2026, Africa/Tunis. Ajustements demandés après la publication des
agents et du dashboard : retirer l’e-mail des listes de présence, afficher
prénom/nom et photo de profil, et afficher six lignes par page dans les tableaux.

Version applicative : `7702f2b723ab68791f4028bc612882a7091db3bd`, push normal sur
`codex/collaborator-firebase-release`, sans réécriture d’historique.

## Comportement

La page de pointage a quatre colonnes et affiche l’avatar à côté du nom. Les
étudiants sans photo gardent les initiales. Le suivi et l’historique de présence
n’affichent plus d’e-mail. Les anciennes séances transmettent maintenant
`profilePhotoId`, déjà disponible dans la sélection serveur. Les permissions de
photos, de pointage et d’accès aux comptes ne changent pas.

La constante de pagination vaut six dans chaque projet. Les tableaux des
membres/demandes, collaborateurs, groupes, demandes d’adhésion, administrateurs,
établissements, pointages et présences utilisent cette taille. Le dashboard et
les listes paginées de suivi sont alignés côté serveur et navigateur. Les
requêtes explicites de chargement de sélecteurs conservent leur limite dédiée ;
les messages et notifications, qui ne sont pas des tableaux, restent inchangés.

Les filtres repartent de la première page. Les sélections multiples et les
pointages non enregistrés restent conservés entre les pages ; l’enregistrement
de présence envoie ensemble les modifications de toutes les pages.

## Validation

- 232 tests unitaires backend réussis.
- Tests PWA : 117 tests de logique, dont 12 tests de pointage ; les scénarios UI
  concernés sont passés après adaptation des attentes à six lignes. Les
  sélections entre pages et les filtres restent vérifiés.
- Neuf tests HTTP analytiques sur PostgreSQL Docker jetable réussis, avec six
  résultats par page, dernière page partielle et absence de doublons.
- TypeScript et compilations backend/PWA réussis. Lint frontend et lint backend
  ciblé réussis.
- Quatre scénarios navigateur locaux réussis à 320/1440 px, FR/EN,
  clair/sombre : six étudiants puis un sur la dernière page, absence d’e-mail,
  chargement de photo et conservation/enregistrement des pointages sur deux
  pages. Captures contrôlées, aucun débordement horizontal.

## Publication

Render : `dep-dbut3sp5efls73fblmf0`, état **live**, commit exact vérifié.
Vercel : `dpl_5LLiwxDgiC613mVRAmSrAb8YQqnA`, état **READY**, même commit,
`aliasAssigned: true`, domaine https://teamchtaw-pwa.vercel.app affecté.

Les 14 contrôles publics de santé et d’autorisations réussissent sur l’API et le
proxy PWA. Les quatre scénarios navigateur sur le site publié réussissent à
320/1440 px, FR/EN : absence d’e-mail dans les cellules, photo chargée, six
lignes sur la première page et une sur la dernière, et enregistrement commun
des pointages saisis sur deux pages. Aucun débordement horizontal. Captures sous
`chtaw-team-pwa/.test-analytics-browser/tables-production/`, ignorées par Git.

Aucune migration ni modification de données métier n’a été effectuée. Les
sauvegardes préexistantes sont conservées.

Les tests navigateur utilisent uniquement des identités et réponses simulées,
avec interception des API privées et WebSockets. Aucun compte ou pointage réel
n’est créé ou modifié pour la recette.
