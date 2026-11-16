# Inscription étudiante : Identité, Lycée, Compte

Refonte locale de la PWA, sans déploiement ni modification du backend ou de la base de production. La version précédemment publiée reste `c916cb5` ; elle ne contient pas cette refonte.

## Réalisation

- Une seule étape est montée dans le DOM : les autres ne sont ni visibles, ni accessibles au clavier ou aux lecteurs d’écran. L’indicateur signale l’étape active et les étapes terminées.
- Identité : prénom, nom et avatar circulaire de 54 px. Ajout/remplacement par bouton appareil photo accessible au clavier, aperçu, retrait discret et mention Facultatif. Le champ fichier natif reste masqué. Les validations et limites d’image existantes sont réutilisées.
- Lycée : liste native avec frappe des premières lettres et navigation clavier, sans recherche séparée. Option Autre avec nom obligatoire ; chargement, erreur/réessai et liste vide. Le mode de sélection admin conserve sa recherche habituelle.
- Compte : email, huit chiffres après +216, mot de passe et confirmation avec boutons indépendants d’affichage. Les règles existantes sont conservées et les nouveaux messages sont en français.
- Suivant valide uniquement l’étape en cours. Retour conserve valeurs, sélection et fichier. Les erreurs sont associées aux champs ; le focus rejoint le premier champ invalide ou le titre après une transition. Une erreur serveur sur l’identité ou le lycée renvoie à l’étape concernée.
- L’envoi reste celui de `useCommunity.register` : compte créé seulement à la dernière étape, puis photo après authentification. Verrou contre les doubles soumissions. Aucun mot de passe ou fichier enregistré dans localStorage.
- Transition CSS de 180 ms : entrée vers la gauche en avançant et vers la droite au retour ; supprimée avec prefers-reduced-motion. Hauteur naturelle, aucune largeur supplémentaire, défilement vertical conservé. Sur mobile, l’inscription reste ancrée sous le logo pour éviter un grand espace vide aux étapes courtes.
- Logo, thèmes, décor animé limité au panneau droit et présentation du panneau gauche conservés. Le formulaire de connexion conserve son rendu et son comportement ; le parcours Firebase et les validations administratives existantes ne changent pas.

## Vérifications

- TypeScript, lint et build de production local de la PWA réussis.
- 116 tests de logique et 179 tests d’interface réussis, dont validation/focus, navigation sans création, conservation photo/lycée, double soumission et erreur serveur vers le lycée.
- 37 scénarios Playwright réussis : six scénarios dédiés au nouveau parcours, régression du fond et de la connexion, inscriptions avec/sans photo, puis profils et administration. Largeurs 390/1440 px dans les deux thèmes, liste de 251 lycées et sélection par frappe, option Autre, erreur/réessai et liste vide, viewport réduit à 320 px, réduction des animations et simulation de clavier par diminution de hauteur.
- Douze captures des trois étapes examinées dans les quatre combinaisons taille/thème. Galerie : `chtaw-team-pwa/.test-browser-results/registration-wizard-review.html`. Les images PNG originales sont accessibles depuis la galerie.

Les contrôles mobiles sont des vérifications dans Edge à viewport mobile ; aucun clavier physique iOS/Android n’a été testé. Les appels d’inscription des tests navigateur sont simulés et ne créent aucun compte en production.
