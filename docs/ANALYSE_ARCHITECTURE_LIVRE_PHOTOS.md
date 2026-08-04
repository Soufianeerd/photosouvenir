# Analyse technique complète — Livre photos et vidéos du mariage

**Projet analysé :** livre-photos  
**Événement :** mariage de Salma et Soufiane — 23 octobre 2026  
**Date de l’analyse :** 4 août 2026  
**Périmètre réellement reçu :** deux fichiers de code, cinq filtres PNG transparents et une capture de l’arborescence du projet.

---

## 0. Inventaire des sources analysées

### Fichiers de code transmis

| Chemin logique observé dans le projet | Fichier reçu pour l’analyse | Taille | Rôle constaté |
|---|---:|---:|---|
| `index.html` | `index(32).html` | ~44 Ko, 945 lignes | Application web complète dans un seul fichier : HTML, CSS et JavaScript inline |
| `Code-livre-photos.gs` | `Code-livre-photos(1).gs` | ~19 Ko, 427 lignes | Backend Google Apps Script : réception d’une photo en base64, sauvegarde Drive, journal Sheet facultatif, email facultatif |

### Assets transmis

| Chemin logique observé | Dimensions | Format | Transparence constatée | Taille approximative | Orientation exploitable |
|---|---:|---|---:|---:|---|
| `filtres/filtreS&S.png` | 1024 × 1536 | PNG RGBA | 75,92 % de pixels totalement transparents | 1,3 Mo | Portrait 2:3 uniquement |
| `filtres/filtreS&S2.png` | 1024 × 1536 | PNG RGBA | 79,70 % | 1,1 Mo | Portrait 2:3 uniquement |
| `filtres/filtreSoufiane&Salma.png` | 1024 × 1536 | PNG RGBA | 92,79 % | 477 Ko | Portrait 2:3 uniquement |
| `filtres/filtreSoufiane&Salma2.png` | 1024 × 1536 | PNG RGBA | 89,31 % | 574 Ko | Portrait 2:3 uniquement |
| `filtres/filtreSoufiane&Salma3.png` | 1024 × 1536 | PNG RGBA | 92,94 % | 425 Ko | Portrait 2:3 uniquement |

Les cinq fichiers possèdent bien un canal alpha exploitable. Le noir visible dans certains logiciels correspond donc à la transparence et ne constitue pas un fond noir réel.

### Éléments non fournis

Les éléments suivants sont **non confirmés dans les fichiers** :

- dépôt Git et historique de commits ;
- `package.json`, gestionnaire de dépendances ou système de build ;
- fichiers CSS ou JavaScript séparés ;
- framework frontend ;
- configuration Netlify ;
- nom de domaine et QR code réellement déployé ;
- base Supabase, Firebase, S3 ou autre stockage ;
- routes API autres que Google Apps Script ;
- authentification ;
- tests automatisés ;
- interface d’administration ;
- variantes paysage des filtres ;
- miniatures dédiées aux filtres ;
- configuration de production de Google Sheet, car `SHEET_ID` est vide ;
- quotas et type exact du compte Google utilisé ;
- politique de conservation et de suppression des médias.

Les deux fichiers JavaScript ont été soumis à une vérification de syntaxe. Aucune erreur de syntaxe JavaScript bloquante n’a été détectée. Cela ne constitue pas un test d’exécution dans un navigateur ou dans Google Apps Script.

---

# 1. Résumé de l’architecture actuelle

## 1.1 Frontend

Le frontend est une application statique monolithique contenue entièrement dans `index.html` :

- structure HTML ;
- design CSS ;
- état applicatif ;
- navigation entre les étapes ;
- sélection de fichier ;
- compression de la photo ;
- création de l’aperçu ;
- encodage base64 ;
- appel réseau ;
- téléchargement du résultat.

Aucun composant, module, service ou fichier de configuration séparé n’existe à ce stade. L’interface est limitée à une largeur de 480 px et repose sur un thème crème et bordeaux. Les polices sont chargées depuis Google Fonts.

Le parcours actuel comporte en réalité quatre états visuels :

1. saisie du prénom et de la relation ;
2. choix ou prise d’une photo par un champ fichier ;
3. aperçu, légende, option d’envoi par email et envoi aux mariés ;
4. confirmation et téléchargement.

Les libellés indiquent pourtant « Étape 1 / 3 », « Étape 2 / 3 » et « Étape 3 / 3 », tandis que les indicateurs comportent quatre points. Il s’agit d’une incohérence d’interface mineure mais réelle.

## 1.2 Backend

`Code-livre-photos.gs` est une application web Google Apps Script publique, configurée pour s’exécuter avec les droits du propriétaire du script.

Flux actuel :

1. réception d’un JSON contenant la photo en base64 ;
2. décodage base64 ;
3. création d’un Blob avec le MIME déclaré par le client ;
4. recherche ou création d’un dossier Drive par son nom ;
5. création du fichier dans Drive ;
6. passage automatique du fichier en accès « toute personne disposant du lien » ;
7. écriture facultative dans Google Sheets ;
8. notification facultative au propriétaire ;
9. envoi facultatif d’une copie à l’invité ;
10. retour d’un JSON `success`.

## 1.3 Stockage

Google Drive est actuellement le stockage principal et direct. Il n’existe ni stockage temporaire, ni file de traitement, ni mécanisme d’upload reprenable, ni table de suivi fiable des statuts.

Le dossier Drive est identifié par son **nom**, pas par un identifiant immuable. Si plusieurs dossiers portent le même nom, le premier résultat trouvé sera utilisé.

## 1.4 Données

L’état frontend est conservé uniquement en mémoire JavaScript. Un rechargement ou une fermeture de page supprime la capture en cours.

Les métadonnées actuelles sont :

- prénom ;
- relation ;
- légende ;
- email facultatif ;
- nom du fichier ;
- identifiant Drive lorsque l’écriture réussit.

La journalisation Google Sheets est prévue, mais **désactivée dans le fichier reçu** parce que `SHEET_ID` est vide.

---

# 2. Fonctionnalités déjà présentes

## 2.1 Fonctionnalités réellement opérationnelles dans le code

- interface mobile simple, sans installation ;
- prénom obligatoire ;
- relation facultative ;
- photo depuis la caméra native via `<input capture="environment">` ;
- photo depuis la galerie ;
- glisser-déposer sur ordinateur ;
- validation cliente sommaire du type `image/*` ;
- limite de 20 Mo sur le fichier original ;
- aperçu local ;
- compression JPEG avec Canvas ;
- largeur maximale de 1400 px ;
- recompression à 1000 px et qualité 0,70 lorsque le Blob dépasse 2 Mo ;
- légende facultative ;
- envoi aux mariés ;
- copie facultative par email ;
- tentative de retry après un timeout ;
- téléchargement local par lien `download` ;
- sauvegarde dans Drive ;
- journal Sheet facultatif ;
- emails HTML ;
- fonction de diagnostic Apps Script ;
- fonction de liste des photos Drive.

## 2.2 Fonctionnalités absentes à ce stade

- capture en direct avec `getUserMedia` ;
- aperçu caméra temps réel ;
- bascule caméra avant/arrière ;
- gestion dédiée des permissions caméra et microphone ;
- vidéo ;
- limite vidéo de 60 secondes ;
- chronomètre ;
- enregistrement audio ;
- import vidéo ;
- filtres ;
- aperçu live d’un filtre ;
- navigation par swipe ;
- option « Aucun filtre » ;
- fusion finale média + filtre ;
- variantes paysage ;
- Web Share API ;
- partage AirDrop ou réseaux sociaux depuis une feuille de partage native ;
- progression réelle de l’upload ;
- upload par morceaux ;
- reprise d’upload ;
- idempotence ;
- détection des doubles envois ;
- stockage privé ;
- authentification ou jeton événementiel ;
- rate limiting ;
- anti-spam ;
- consentement explicite ;
- validation serveur du type réel du fichier ;
- validation serveur de la taille ;
- vérification serveur de la durée ;
- traitement FFmpeg ;
- file de jobs ;
- tests automatisés ;
- administration des filtres.

---

# 3. Éléments réutilisables

## 3.1 Design system existant

Les variables CSS sont une bonne base :

- crème `#F9F7F2` ;
- bordeaux `#5D262C` ;
- encre `#2D1214` ;
- typographies Cormorant Garamond et Montserrat ;
- animations sobres ;
- cartes et boutons cohérents.

À conserver, mais à enrichir avec un doré normalisé, par exemple `#C7A35A`, et avec des contrastes validés.

## 3.2 Parcours guidé

Le mécanisme de changement d’étape peut être réutilisé conceptuellement, mais il doit être remplacé par une machine d’état explicite. L’actuel `showStep(id)` est trop limité pour gérer :

- permissions ;
- capture en cours ;
- enregistrement vidéo ;
- traitement ;
- upload en pause ;
- reprise ;
- erreurs récupérables ;
- jobs asynchrones.

## 3.3 Compression photo Canvas

Le principe de Canvas est réutilisable pour :

- normaliser l’orientation ;
- redimensionner ;
- supprimer les métadonnées EXIF sensibles par réencodage ;
- fusionner une photo et un filtre ;
- créer une miniature.

Le code actuel devra néanmoins être remplacé pour gérer les dimensions finales, le filtre, l’orientation EXIF, les erreurs de décodage et une résolution adaptative.

## 3.4 Emails Google Apps Script

Les templates HTML peuvent être conservés comme référence visuelle ou comme service d’archive facultatif. Ils ne doivent pas constituer la voie principale de livraison d’une vidéo.

## 3.5 Filtres fournis

Les cinq PNG sont directement exploitables comme variantes portrait. Leur transparence est correcte. Il faut toutefois :

- les référencer depuis une configuration centralisée ;
- créer des miniatures ;
- créer de vraies versions paysage ;
- harmoniser les noms et textes ;
- optimiser les fichiers ;
- éviter les caractères `&`, espaces et accents dans les futurs noms techniques.

---

# 4. Problèmes et limites détectés

## 4.1 Problèmes critiques

### A. Faux succès possible après un envoi échoué

Le frontend utilise `fetch(..., { mode: 'no-cors' })`. Une réponse `no-cors` est opaque : le JavaScript ne peut lire ni le statut, ni les en-têtes, ni le corps. Le code affiche donc le succès dès que la promesse réseau se résout, même si Apps Script a retourné `{ success: false }`, si l’écriture Drive a échoué, ou si le serveur a répondu avec une erreur applicative.

Conséquence : un invité peut voir « Photo bien reçue » alors que la photo n’a pas été enregistrée.

**Priorité : critique.**

### B. Médias rendus publics automatiquement

Le backend exécute :

```js
file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
```

Cela contredit directement l’exigence « aucun média ne doit être rendu public automatiquement ». « Toute personne disposant du lien » n’est pas un stockage privé strict.

**Priorité : critique.**

### C. Endpoint public sans protection

Le script est prévu avec l’accès « N’importe qui » et ne comporte :

- aucun jeton événementiel ;
- aucun captcha ;
- aucune limite par IP ou session ;
- aucun quota applicatif ;
- aucune signature ;
- aucune vérification d’origine fiable ;
- aucune idempotence.

Une personne connaissant l’URL peut automatiser des uploads, consommer les quotas Drive/Mail/Apps Script et déposer des contenus non souhaités.

**Priorité : critique.**

### D. Validation serveur insuffisante

Le backend fait confiance à :

- `mimeType` ;
- `filename` ;
- la présence de `photo` ;
- la taille ;
- le contenu binaire ;
- l’email.

Il ne vérifie pas la signature réelle du fichier, ne limite pas les octets décodés et n’impose pas une liste de formats. Un fichier arbitraire peut être présenté comme `image/jpeg`.

**Priorité : critique.**

### E. Architecture incompatible avec la vidéo HD/4K fiable

Une vidéo de 60 secondes en 1080p peut représenter plusieurs dizaines de mégaoctets ; une vidéo 4K peut dépasser largement 100 Mo. L’encodage base64 ajoute environ un tiers de volume et multiplie l’usage mémoire côté navigateur. Le schéma actuel JSON + base64 + Apps Script n’est pas adapté aux uploads vidéo mobiles fiables.

**Priorité : critique pour l’objectif vidéo.**

## 4.2 Problèmes importants

### F. Aucun filtre n’est utilisé

Les cinq assets existent, mais aucun code ne les charge, ne les affiche ou ne les fusionne.

### G. Tous les filtres sont uniquement en portrait 2:3

Aucune variante paysage n’a été fournie. Étendre une image 2:3 sur une vidéo 16:9 déformerait le graphisme. Utiliser `cover` couperait les bordures et textes. Utiliser `contain` laisserait des zones sans cadre.

**Conclusion :** la prise en charge paysage parfaite est impossible avec les seuls assets reçus. De vraies variantes paysage doivent être créées. Toute autre solution est un fallback visuel, pas une équivalence graphique.

### H. « Enregistrer directement dans la galerie » ne peut pas être garanti sur le Web

Une page web ne dispose pas d’un droit universel d’écriture directe dans la photothèque iOS ou Android. La solution correcte est :

1. proposer `navigator.share()` avec un objet `File` lorsque le navigateur le permet ;
2. l’utilisateur choisit « Enregistrer l’image », « Enregistrer la vidéo », AirDrop ou une application ;
3. proposer un téléchargement classique en fallback.

Le texte de l’interface ne doit pas promettre une sauvegarde automatique dans Photos. Il doit indiquer « Partager ou enregistrer ».

### I. Progression d’upload simulée ou absente

Les éléments HTML de progression existent, mais ils ne sont pas utilisés pendant le `fetch`. `fetch` standard ne fournit pas ici de progression d’upload. La barre actuelle ne représente donc pas un avancement réel.

### J. Risque de double envoi

Le bouton d’envoi n’est pas verrouillé dès le clic. Un double clic ou un retry après un doute peut créer plusieurs fichiers identiques.

### K. Gestion HEIC incohérente

L’interface annonce HEIC. Si le navigateur ne parvient pas à décoder le fichier pour le Canvas, le fallback conserve le fichier original, mais l’envoi force toujours :

- MIME `image/jpeg` ;
- extension `.jpg`.

Le contenu peut donc être HEIC avec un nom et un MIME JPEG, ce qui rend le fichier incohérent.

### L. Résolution actuelle insuffisante pour l’objectif annoncé

Le fichier est réduit à 1400 px, puis parfois à 1000 px. Ce n’est ni du 4K, ni une conservation haute définition satisfaisante pour impression.

### M. Fuite d’Object URL

Lors d’une compression réussie, l’URL temporaire créée avant la compression n’est pas toujours révoquée. Sur plusieurs souvenirs, cela peut augmenter la mémoire utilisée.

### N. Journal Sheet exposé aux formules

Les champs prénom, relation et légende sont écrits directement dans Sheet. Une valeur commençant par `=`, `+`, `-` ou `@` peut être interprétée comme une formule. Les cellules textuelles doivent être neutralisées.

### O. Injection HTML locale possible dans le message de succès

L’email saisi est injecté via `innerHTML` sans échappement et sans appel à `checkValidity()`. Il faut construire le DOM avec `textContent` ou échapper la valeur.

### P. Limites MailApp

Les quotas d’email sont limités, notamment pour les comptes grand public. L’envoi d’une copie à chaque invité peut épuiser le quota pendant le mariage. La copie par email ne doit pas être le mécanisme principal de récupération du fichier.

## 4.3 Problèmes de maintenabilité

- 945 lignes dans un seul HTML ;
- CSS et JavaScript inline ;
- nombreux handlers `onclick` inline ;
- configuration mélangée au code ;
- aucun contrat de données ;
- aucun typage ;
- aucun test ;
- aucune séparation capture/composition/upload/partage ;
- aucune gestion de versions de filtre ;
- aucune stratégie de migration.

## 4.4 Problèmes d’accessibilité et d’UX

- `user-scalable=no` empêche ou limite le zoom ;
- textes de 0,55 à 0,68 rem parfois trop petits ;
- icônes emoji non homogènes ;
- zone de drop sous forme de `div` cliquable non pleinement accessible au clavier ;
- indicateurs d’étape sans texte accessible ;
- absence de `aria-live` pour les statuts d’upload ;
- absence de gestion `prefers-reduced-motion` ;
- aucun écran de consentement ;
- aucune explication de la permission microphone ;
- aucune stratégie pour le clavier virtuel et les safe areas iPhone ;
- aucune reprise après fermeture accidentelle.

---

# 5. Analyse détaillée par fichier existant

## 5.1 `index.html`

### Rôle actuel

Application client autonome, mobile-first, qui prend ou importe une photo, la compresse, l’envoie à Apps Script et permet de télécharger le Blob.

### Modifications recommandées

Le fichier doit devenir un shell HTML léger contenant :

- métadonnées ;
- conteneur racine ;
- balises vidéo/canvas nécessaires ;
- liens vers CSS ;
- chargement du module principal ;
- contenu de fallback `noscript`.

Le CSS et le JavaScript inline doivent être extraits.

### Fonctions actuelles à remplacer ou déplacer

| Fonction actuelle | Destination recommandée | Action |
|---|---|---|
| `showAlert` | `src/ui/notifications.ts` | Remplacer par notifications accessibles avec `aria-live` |
| `showStep` | `src/state/app-machine.ts` | Remplacer par une machine d’état |
| `formatSize` | `src/utils/file.ts` | Conserver et tester |
| `goToPhoto` | contrôleur d’onboarding | Réduire la saisie obligatoire ; prénom facultatif recommandé |
| `handleFile` | `src/media/import-media.ts` | Étendre photo/vidéo et validations |
| `compressImage` | `src/media/photo-compositor.ts` | Gérer EXIF, filtre, taille adaptative et sortie finale |
| `toggleEmail` | composant d’options | Email facultatif, non prioritaire |
| `blobToBase64` | legacy uniquement | Ne plus utiliser pour les gros médias |
| `sendPhoto` | `src/upload/upload-manager.ts` | Remplacer par upload signé/direct et idempotent |
| `saveToPhone` | `src/share/share-service.ts` | Web Share fichier puis téléchargement fallback |
| `resetAll` | machine d’état | Libérer flux caméra, URLs, timers et jobs |

### Dépendances éventuelles

- Vite ;
- TypeScript ;
- Vitest ;
- Playwright ;
- `tus-js-client` uniquement pour les uploads vidéo reprenables ;
- éventuellement `idb-keyval` ou un petit wrapper IndexedDB ;
- aucune bibliothèque UI lourde.

### Points de vigilance

- conserver le thème existant ;
- ne pas demander caméra/micro au chargement ;
- déclencher les permissions après une action utilisateur ;
- ne pas garder le flux caméra actif hors écran ;
- ne pas bloquer le zoom ;
- ne jamais afficher « envoyé » avant confirmation serveur lisible.

## 5.2 `Code-livre-photos.gs`

### Rôle actuel

Backend public photo-only pour Drive, Sheet et email.

### Modifications recommandées

Deux stratégies sont possibles :

1. **Recommandée :** conserver ce script uniquement comme adaptateur legacy ou comme tâche de synchronisation vers Drive ; ne plus l’utiliser pour l’ingestion directe des médias.
2. **MVP photo provisoire :** le durcir pour les photos uniquement, avec réponse vérifiable, validations, idempotence et fichiers privés. Cette voie ne couvre pas correctement la vidéo.

### Fonctions à modifier

| Fonction | Modification |
|---|---|
| `doPost` | Valider schéma, taille décodée, MIME autorisé, jeton événement, identifiant idempotent ; ne jamais rendre public ; retourner un résultat exploitable |
| `logToSheet_` | Neutraliser les formules, ajouter métadonnées et statuts |
| `sendOwnerNotification_` | Désactiver par défaut ou envoyer un récapitulatif groupé |
| `sendPhotoToGuest_` | Vérifier quota et email ; ne pas joindre de vidéo lourde |
| `getOrCreateFolder_` | Utiliser un `DRIVE_FOLDER_ID` configuré, pas un nom |
| `sanitize_` | Ajouter une normalisation stricte et imposer l’extension selon le type réel |
| `doGet` | Ne pas exposer publiquement des informations internes inutiles |
| `testSetup` | Ajouter tests de dossier privé, quotas restants et configuration |

### Nouveaux éléments possibles si le script est conservé

- `validateRequest_()` ;
- `validateImageMagic_()` dans les limites d’Apps Script ;
- `validateEventToken_()` ;
- `acquireIdempotencyLock_()` avec `LockService` ;
- `getProcessedRequest_()` avec `CacheService` ou `PropertiesService` ;
- `sanitizeSheetText_()` ;
- `getFolderById_()` ;
- `buildErrorResponse_()` ;
- journal des tentatives.

### Points de vigilance

Apps Script reste soumis à des quotas et à une durée d’exécution. Il n’est pas recommandé pour la composition FFmpeg ni pour l’ingestion directe de vidéos mobiles volumineuses.

## 5.3 `filtres/*.png`

### Rôle actuel

Assets graphiques transparents non utilisés par le code.

### Modifications recommandées

- conserver les originaux ;
- copier vers des noms techniques normalisés ;
- créer des miniatures WebP ;
- créer des variantes paysage ;
- ajouter chaque asset à `filters.json` ;
- définir les zones de sécurité ;
- optimiser sans dégrader l’alpha ;
- harmoniser l’ordre du couple et le format de date.

### Noms techniques proposés

| Original | Copie normalisée proposée |
|---|---|
| `filtreS&S.png` | `filter-ss-floral-burgundy-01.png` |
| `filtreS&S2.png` | `filter-ss-ivory-gold-02.png` |
| `filtreSoufiane&Salma.png` | `filter-salma-soufiane-gold-03.png` |
| `filtreSoufiane&Salma2.png` | `filter-salma-soufiane-gold-04.png` |
| `filtreSoufiane&Salma3.png` | `filter-salma-soufiane-ivory-05.png` |

### Incohérences graphiques à arbitrer

- ordre « Soufiane & Salma » dans le code, mais « Salma & Soufiane » sur plusieurs filtres ;
- formats de date différents : texte, points et barres obliques ;
- titres différents : `THE WEDDING`, `WEDDING`, initiales seules ;
- densité décorative très différente entre les modèles.

**Recommandation :** adopter partout `Salma & Soufiane` et `23 octobre 2026`, sauf choix contraire explicite.

---

# 6. Nouveaux fichiers recommandés

L’architecture proposée reste légère : **Vite + TypeScript sans framework UI**.

```text
livre-photos/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── netlify.toml
├── .env.example
├── README.md
├── public/
│   ├── icons/
│   └── filters/
│       ├── filters.json
│       ├── portrait/
│       │   ├── filter-ss-floral-burgundy-01.png
│       │   ├── filter-ss-ivory-gold-02.png
│       │   ├── filter-salma-soufiane-gold-03.png
│       │   ├── filter-salma-soufiane-gold-04.png
│       │   └── filter-salma-soufiane-ivory-05.png
│       ├── landscape/
│       │   └── ... variantes à produire
│       └── thumbnails/
│           └── ... miniatures WebP
├── src/
│   ├── main.ts
│   ├── config/
│   │   ├── app-config.ts
│   │   ├── limits.ts
│   │   └── env.ts
│   ├── state/
│   │   ├── app-state.ts
│   │   └── app-machine.ts
│   ├── ui/
│   │   ├── render.ts
│   │   ├── screens/
│   │   │   ├── welcome-screen.ts
│   │   │   ├── media-choice-screen.ts
│   │   │   ├── camera-screen.ts
│   │   │   ├── preview-screen.ts
│   │   │   ├── delivery-screen.ts
│   │   │   ├── upload-screen.ts
│   │   │   └── success-screen.ts
│   │   ├── components/
│   │   │   ├── filter-carousel.ts
│   │   │   ├── capture-controls.ts
│   │   │   ├── recording-timer.ts
│   │   │   ├── upload-progress.ts
│   │   │   ├── consent-notice.ts
│   │   │   └── error-panel.ts
│   │   └── notifications.ts
│   ├── media/
│   │   ├── camera-service.ts
│   │   ├── media-recorder-service.ts
│   │   ├── import-media.ts
│   │   ├── photo-compositor.ts
│   │   ├── video-capabilities.ts
│   │   ├── media-metadata.ts
│   │   └── object-url-registry.ts
│   ├── filters/
│   │   ├── filter-types.ts
│   │   ├── filter-registry.ts
│   │   ├── filter-renderer.ts
│   │   └── filter-preloader.ts
│   ├── upload/
│   │   ├── upload-manager.ts
│   │   ├── resumable-upload.ts
│   │   ├── upload-session-api.ts
│   │   └── offline-queue.ts
│   ├── share/
│   │   └── share-service.ts
│   ├── storage/
│   │   └── draft-store.ts
│   ├── security/
│   │   ├── validation.ts
│   │   └── filename.ts
│   ├── utils/
│   │   ├── id.ts
│   │   ├── time.ts
│   │   ├── file.ts
│   │   └── errors.ts
│   └── styles/
│       ├── tokens.css
│       ├── base.css
│       ├── layout.css
│       ├── camera.css
│       ├── filters.css
│       └── accessibility.css
├── netlify/
│   └── functions/
│       ├── create-upload-session.ts
│       ├── complete-upload.ts
│       ├── processing-status.ts
│       └── drive-sync.ts
├── supabase/
│   └── migrations/
│       ├── 001_memories.sql
│       ├── 002_processing_jobs.sql
│       └── 003_storage_policies.sql
├── video-worker/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── server.ts
│   │   ├── ffmpeg.ts
│   │   ├── probe.ts
│   │   ├── filter-overlay.ts
│   │   └── storage.ts
│   └── README.md
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── legacy/
    └── Code-livre-photos.gs
```

Une interface d’administration complète n’est pas nécessaire pour la première version. `public/filters/filters.json` est suffisant, à condition qu’il soit validé au build et documenté.

---

# 7. Architecture technique recommandée

## 7.1 Choix principal

### Frontend

- Vite ;
- TypeScript ;
- HTML/CSS natifs ;
- aucun framework lourd ;
- hébergement statique HTTPS ;
- chargement différé des filtres ;
- IndexedDB pour conserver un brouillon et une session d’upload interrompue.

### Stockage primaire

- Supabase Storage dans un bucket privé ;
- Postgres pour les métadonnées ;
- URL d’upload signée et limitée dans le temps ;
- TUS pour les vidéos ou fichiers supérieurs à environ 6 Mo ;
- RLS stricte ;
- aucun secret `service_role` dans le frontend.

### Traitement vidéo

- worker FFmpeg conteneurisé sur Cloud Run ou service équivalent ;
- traitement asynchrone ;
- entrée : média brut + filtre + orientation ;
- sortie : MP4 H.264 + AAC, `yuv420p`, `faststart` ;
- validation de durée avec `ffprobe` ;
- suppression du brut selon une politique de rétention.

### Google Drive

- destination d’archive facultative ;
- synchronisation backend après traitement ;
- dossier commun privé pour les deux mariés ;
- OAuth serveur ou compte de service ayant accès à un dossier/Drive partagé ;
- aucun token Google côté client ;
- ne pas appliquer `ANYONE_WITH_LINK`.

## 7.2 Pourquoi Google Drive ne doit pas être l’ingestion principale

Drive est pertinent comme archive finale, mais moins adapté à l’expérience d’upload public mobile :

- gestion d’identité et d’autorisations ;
- difficulté de fournir un upload invité signé et limité ;
- progression et reprise plus complexes ;
- traitement vidéo à orchestrer ailleurs ;
- risque de rendre les fichiers partageables ;
- dépendance aux quotas Apps Script si le script reste intermédiaire.

Une architecture « stockage objet privé → traitement → synchronisation Drive » est plus robuste.

## 7.3 Espace commun recommandé

Pour l’invité, un seul bouton « Envoyer aux mariés » doit être proposé. Le stockage commun est préférable à des espaces Salma/Soufiane séparés.

Une destination interne peut rester disponible dans la configuration pour un futur usage administratif, mais ne doit pas compliquer le parcours principal.

---

# 8. Stratégie de capture photo et vidéo

## 8.1 Détection de capacités

Au démarrage, sans demander de permission :

- vérifier `navigator.mediaDevices?.getUserMedia` ;
- vérifier `window.MediaRecorder` ;
- vérifier les MIME avec `MediaRecorder.isTypeSupported()` ;
- vérifier `navigator.share` et `navigator.canShare` ;
- vérifier Canvas et `canvas.captureStream()` ;
- vérifier IndexedDB ;
- déterminer un mode normal ou fallback.

L’accès caméra et microphone exige un contexte sécurisé HTTPS et doit être demandé après une action de l’utilisateur.

## 8.2 Photo

1. demander uniquement la caméra vidéo ;
2. afficher `<video autoplay muted playsinline>` ;
3. sélectionner `facingMode: 'user'` ou `'environment'` ;
4. basculer de caméra en arrêtant le flux actuel puis en redemandant un flux ;
5. dessiner la frame vidéo dans un Canvas ;
6. appliquer la transformation miroir uniquement à l’aperçu selfie, pas involontairement au fichier final ;
7. dessiner le filtre ;
8. produire un Blob JPEG ou WebP selon compatibilité ;
9. générer miniature et métadonnées ;
10. arrêter toutes les pistes dès la sortie de l’écran.

## 8.3 Vidéo

1. demander caméra + microphone ;
2. choisir un format d’enregistrement accepté par le navigateur ;
3. commencer `MediaRecorder` avec des chunks d’environ une seconde ;
4. afficher un chronomètre basé sur `performance.now()` ;
5. avertir à 50 secondes ;
6. arrêter automatiquement à 60 secondes ;
7. arrêter proprement le recorder et les pistes ;
8. assembler les chunks en Blob ;
9. vérifier la durée côté client ;
10. uploader le brut avec métadonnées ;
11. vérifier la durée côté serveur avec `ffprobe` ;
12. composer le filtre via FFmpeg ;
13. fournir le MP4 final.

## 8.4 Import galerie

- accepter `image/*` et `video/*` ;
- ne pas se fier uniquement au MIME déclaré ;
- extraire les métadonnées ;
- refuser les vidéos de plus de 60 secondes ;
- offrir un message de conversion si le codec n’est pas directement prévisualisable ;
- envoyer le brut au serveur pour normalisation lorsque nécessaire.

## 8.5 Rotation

Pendant un enregistrement, ne pas changer la géométrie de sortie au milieu du fichier. Si le téléphone pivote :

- garder le canvas dans l’orientation initiale ;
- afficher un message « Gardez votre téléphone dans cette orientation jusqu’à la fin » ;
- adapter uniquement les contrôles ;
- enregistrer l’orientation initiale dans les métadonnées.

---

# 9. Stratégie de gestion des filtres

## 9.1 Configuration centralisée

Exemple de `filters.json` :

```json
{
  "version": 1,
  "filters": [
    {
      "id": "none",
      "name": "Aucun filtre",
      "category": "system",
      "active": true,
      "order": 0,
      "mediaTypes": ["photo", "video"],
      "orientations": ["portrait", "landscape"]
    },
    {
      "id": "ss-floral-burgundy-01",
      "name": "S&S — Floral bordeaux",
      "category": "mariage",
      "active": true,
      "order": 10,
      "availableFrom": "2026-01-01T00:00:00Z",
      "availableUntil": "2026-11-30T23:59:59Z",
      "mediaTypes": ["photo", "video"],
      "thumbnail": "/filters/thumbnails/filter-ss-floral-burgundy-01.webp",
      "variants": {
        "portrait": {
          "src": "/filters/portrait/filter-ss-floral-burgundy-01.png",
          "width": 1024,
          "height": 1536,
          "fit": "fill",
          "safeArea": { "top": 0.08, "right": 0.06, "bottom": 0.16, "left": 0.06 }
        },
        "landscape": {
          "src": "/filters/landscape/filter-ss-floral-burgundy-01.png",
          "width": 1536,
          "height": 1024,
          "fit": "fill",
          "safeArea": { "top": 0.08, "right": 0.08, "bottom": 0.14, "left": 0.08 }
        }
      }
    }
  ]
}
```

## 9.2 Rendu

- le média détermine la taille du Canvas ;
- le filtre est dessiné sur l’intégralité du Canvas ;
- aucune déformation n’est autorisée ;
- la variante correspondant à l’orientation est requise ;
- en absence de variante, afficher un avertissement et basculer vers « Aucun filtre » ou vers un fallback explicitement marqué ;
- le filtre live est un `<img>` superposé pour la performance ;
- le rendu final photo utilise Canvas ;
- le rendu final vidéo utilise FFmpeg.

## 9.3 Navigation

- carousel horizontal avec `scroll-snap` ;
- swipe tactile natif ;
- boutons précédent/suivant ;
- miniature sélectionnée avec `aria-selected` ;
- préchargement du filtre courant et des deux voisins ;
- lazy loading des autres ;
- option « Aucun filtre » toujours première ;
- pas de rechargement réseau à chaque sélection.

## 9.4 Administration

### MVP

- ajout par fichier ;
- entrée JSON ;
- validation au build ;
- script de génération de miniatures ;
- documentation.

### V2

- table `filters` ;
- bucket d’assets ;
- formulaire admin authentifié ;
- activation, ordre, dates, aperçu et archivage ;
- ne pas supprimer physiquement un asset utilisé par un souvenir existant.

---

# 10. Stratégie de génération du fichier final

## 10.1 Photo

Le fichier final doit être réellement fusionné :

1. décodage et normalisation de l’orientation ;
2. calcul du ratio ;
3. choix d’un crop contrôlé ou d’un letterbox selon la stratégie UX ;
4. Canvas de sortie ;
5. dessin du média ;
6. dessin du filtre ;
7. export Blob ;
8. vérification de taille ;
9. nom de fichier final.

Résolution recommandée :

- conserver jusqu’à 3840 px sur le côté long lorsque le navigateur et la mémoire le permettent ;
- fallback 2560 px puis 2048 px ;
- ne jamais imposer 4K sur un appareil qui ne le supporte pas ;
- préserver une version finale adaptée à l’impression, sans dépasser inutilement la taille.

## 10.2 Vidéo

### Chemin fiable recommandé

Commande FFmpeg conceptuelle :

```bash
ffmpeg -i input -i filter.png \
  -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[base];[1:v]scale=1080:1920[overlay];[base][overlay]overlay=0:0:format=auto[v]" \
  -map "[v]" -map 0:a? \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart \
  -t 60 output.mp4
```

Les dimensions ne doivent pas être codées en dur : elles dépendent du profil portrait ou paysage.

### Chemin navigateur facultatif

Une composition Canvas en temps réel puis `canvas.captureStream()` peut être tentée sur des navigateurs compatibles. Il faut ajouter la piste audio originale au flux composé. Ce chemin doit rester un **fast path expérimental**, activé uniquement après feature detection et test réel, avec fallback serveur. Il ne doit pas être l’unique implémentation.

## 10.3 Qualité vidéo

- 1080p/30 fps par défaut ;
- 720p fallback si appareil faible ou réseau limité ;
- 4K facultatif et uniquement si la capture, le stockage et le traitement le permettent ;
- audio AAC final ;
- MP4 H.264 final pour compatibilité maximale ;
- vidéo de 60 secondes maximum côté client et serveur.

---

# 11. Stratégie de stockage et d’envoi

## 11.1 Modèle de données proposé

Table `memories` :

```text
id UUID primary key
client_request_id UUID unique
public_event_code TEXT
media_type photo|video
original_mime_type TEXT
final_mime_type TEXT
original_name TEXT
final_name TEXT
raw_path TEXT nullable
final_path TEXT nullable
thumbnail_path TEXT nullable
size_bytes BIGINT
final_size_bytes BIGINT nullable
duration_ms INTEGER nullable
width INTEGER
height INTEGER
orientation portrait|landscape|square
filter_id TEXT nullable
guest_name TEXT nullable
guest_message TEXT nullable
destination common|salma|soufiane|both
upload_status pending|uploading|uploaded|failed
processing_status not_required|queued|processing|ready|failed
drive_sync_status pending|synced|failed|disabled
consent_at TIMESTAMPTZ
created_at TIMESTAMPTZ
uploaded_at TIMESTAMPTZ nullable
processed_at TIMESTAMPTZ nullable
sha256 TEXT nullable
error_code TEXT nullable
```

## 11.2 Upload

1. création d’un `client_request_id` côté client ;
2. appel à `create-upload-session` ;
3. validation du code événement, limites et anti-abus ;
4. création d’un enregistrement `pending` ;
5. émission d’une URL signée courte ;
6. upload direct au stockage ;
7. progression réelle ;
8. reprise TUS ;
9. appel `complete-upload` ;
10. vérification serveur de l’objet ;
11. lancement du job vidéo si nécessaire ;
12. statut final confirmé.

## 11.3 Protection contre les doublons

- contrainte unique sur `client_request_id` ;
- bouton verrouillé pendant la requête ;
- même identifiant conservé lors d’un retry ;
- checksum facultatif ;
- le serveur retourne le souvenir existant au lieu de recréer un fichier.

## 11.4 Mode hors-ligne ou connexion instable

- conserver le Blob et les métadonnées dans IndexedDB si la taille et le navigateur le permettent ;
- conserver l’URL de session TUS ;
- afficher « Envoi en pause » ;
- reprendre au retour du réseau ;
- ne pas prétendre que l’envoi est terminé avant confirmation.

## 11.5 Synchronisation Drive

- job backend après `processing_status = ready` ;
- nom unique ;
- dossier commun privé ;
- stocker l’ID Drive dans la base ;
- retry avec backoff ;
- ne pas bloquer la confirmation utilisateur si l’archive Drive est temporairement en échec, tant que le stockage primaire privé est sûr.

---

# 12. Contraintes iOS, Android et navigateurs

## 12.1 Contraintes communes

- caméra/micro seulement en HTTPS ;
- permission déclenchée par une action utilisateur ;
- erreurs `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError` ;
- MIME MediaRecorder à tester au runtime ;
- partage natif déclenché par un clic ou toucher ;
- ne pas supposer qu’un navigateur peut encoder un format simplement parce qu’il peut le lire.

## 12.2 iPhone / Safari

- utiliser `playsinline` pour éviter un plein écran vidéo non souhaité ;
- l’autoplay doit être muet pour l’aperçu ;
- la feuille de partage est la meilleure voie pour AirDrop et « Enregistrer dans Photos » ;
- le téléchargement classique peut ouvrir une prévisualisation ou enregistrer dans Fichiers au lieu de Photos ;
- gérer les safe areas avec `env(safe-area-inset-*)` ;
- éviter de conserver une grande quantité de chunks en mémoire ;
- ne pas compter sur un codec unique sans `isTypeSupported()` ;
- tester sur appareils physiques.

## 12.3 Android / Chrome

- MediaRecorder produit souvent WebM selon les capacités ;
- un transcodage serveur vers MP4 reste nécessaire pour uniformiser ;
- la feuille de partage permet le partage vers les applications installées ;
- le téléchargement peut aller dans Téléchargements, pas directement dans la galerie ;
- les appareils Android d’entrée de gamme nécessitent un mode 720p.

## 12.4 Ordinateur

- fallback import fichier ;
- caméra webcam si disponible ;
- glisser-déposer ;
- navigation clavier ;
- téléchargement direct.

---

# 13. Risques techniques

| Risque | Gravité | Probabilité | Réduction |
|---|---|---|---|
| Faux message de succès actuel | Critique | Élevée | Supprimer `no-cors`, réponse API vérifiable |
| Upload vidéo interrompu | Élevée | Élevée en 4G | TUS, reprise et chunks |
| Échec mémoire sur photo 4K | Élevée | Moyenne | résolution adaptative, libération Canvas/URLs |
| Codec non compatible | Élevée | Élevée | feature detection + transcodage FFmpeg |
| Filtre paysage absent | Élevée | Certaine | produire cinq variantes paysage |
| Quota email Apps Script | Moyenne/élevée | Selon invités | Web Share prioritaire, email optionnel |
| Spam sur endpoint public | Critique | Moyenne | jeton événement, rate limit, Turnstile adaptatif |
| Médias publics sur Drive | Critique | Certaine actuellement | stockage privé, supprimer `ANYONE_WITH_LINK` |
| Duplication lors du retry | Élevée | Moyenne | idempotency key unique |
| Fermeture de page | Moyenne | Moyenne | IndexedDB et reprise |
| Traitement FFmpeg trop lent | Moyenne | Moyenne | job async, profils 720p/1080p, autoscaling |
| Coût stockage/processing | Moyenne | Variable | quotas événementiels, rétention du brut |
| Divergence graphique des filtres | Moyenne | Certaine | charte et noms normalisés |

---

# 14. Améliorations UI/UX recommandées

## 14.1 Parcours cible simplifié

1. **Accueil** — « Créez un souvenir pour Salma & Soufiane » ;
2. **Choix** — Photo ou vidéo ; import galerie en option secondaire ;
3. **Consentement bref** — une seule phrase et lien « En savoir plus » ;
4. **Caméra** — plein écran, filtre visible, carousel en bas ;
5. **Aperçu** — Recommencer / Conserver ;
6. **Informations facultatives** — prénom + message, repliables ;
7. **Action** — « Envoyer aux mariés » et « Partager ou enregistrer » ;
8. **Progression** — état réel ;
9. **Confirmation** — nouveau souvenir.

Il n’est pas nécessaire d’imposer le prénom avant d’accéder à la caméra. Cela ralentit le parcours. Le prénom peut être facultatif après la capture.

## 14.2 Caméra

- aperçu presque plein écran ;
- bouton capture central ;
- bascule photo/vidéo ;
- flip caméra ;
- timer ;
- filtre en surimpression ;
- carousel accessible au pouce ;
- texte minimal ;
- bouton fermer qui libère la caméra.

## 14.3 Livraisons

Présenter trois cartes ou boutons clairs :

- `Partager ou enregistrer` ;
- `Envoyer aux mariés` ;
- `Faire les deux`.

Lorsque Web Share n’est pas disponible, remplacer la première action par `Télécharger le fichier`.

## 14.4 Messages recommandés

- « Autorisez la caméra pour créer votre souvenir. »
- « Le microphone est utilisé uniquement pour enregistrer le son de votre vidéo. »
- « Votre vidéo peut durer jusqu’à 60 secondes. »
- « Gardez votre téléphone dans cette orientation pendant l’enregistrement. »
- « Faites glisser pour choisir un filtre. »
- « Envoi en pause. Nous reprendrons dès que la connexion revient. »
- « Votre souvenir est bien enregistré dans l’album privé des mariés. »
- « Ouvrez le menu de partage pour l’enregistrer dans Photos, l’envoyer par AirDrop ou le partager. »

---

# 15. Mesures de sécurité et confidentialité

## 15.1 Obligatoires

- bucket privé ;
- URL signées courtes ;
- service role uniquement backend ;
- code événement validé ;
- limite par IP, session et événement ;
- idempotence ;
- contrôle taille avant et après upload ;
- contrôle signature binaire réelle ;
- liste blanche MIME ;
- validation serveur de durée ;
- normalisation des noms ;
- suppression EXIF pour la sortie photo ;
- scan ou inspection des fichiers ;
- CSP ;
- en-têtes `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ;
- aucun média public par défaut ;
- logs sans données sensibles inutiles ;
- politique de rétention ;
- suppression du média brut après traitement, si non nécessaire.

## 15.2 Anti-abus sans gêner les invités

- jeton événement dans l’URL QR, non secret mais nécessaire ;
- session d’upload limitée dans le temps ;
- maximum de souvenirs par appareil sur une fenêtre donnée ;
- maximum d’octets par session ;
- Turnstile invisible ou challenge uniquement après comportement anormal ;
- blocage des extensions/MIME inconnus ;
- alertes administratives sur pics d’usage.

## 15.3 Consentement

Texte conseillé :

> La caméra et le microphone servent uniquement à créer ce souvenir. Vous pouvez l’enregistrer sans l’envoyer. Si vous choisissez « Envoyer aux mariés », le média sera conservé dans leur album privé et ne sera pas publié automatiquement.

Conserver `consent_at` uniquement lorsque l’utilisateur choisit l’envoi.

---

# 16. Tests à prévoir

## 16.1 Tests unitaires

- validation `filters.json` ;
- sélection de variante portrait/paysage ;
- calcul `cover`, `contain` et crop ;
- génération de nom de fichier ;
- formatage taille et durée ;
- validation MIME/extension ;
- limite 60 secondes ;
- machine d’état ;
- idempotency key ;
- nettoyage des Object URLs ;
- comportement Web Share/fallback.

## 16.2 Tests d’intégration frontend

- permission accordée ;
- permission refusée ;
- caméra absente ;
- bascule caméra ;
- capture photo ;
- vidéo 5 secondes ;
- arrêt manuel ;
- arrêt automatique à 60 secondes ;
- import photo ;
- import vidéo ;
- vidéo > 60 secondes refusée ;
- aucun filtre ;
- chacun des cinq filtres ;
- swipe ;
- changement orientation avant capture ;
- rotation pendant vidéo ;
- téléchargement ;
- Web Share ;
- reprise après erreur.

## 16.3 Tests backend

- session signée valide/expirée ;
- code événement invalide ;
- limite IP ;
- type réel invalide ;
- fichier trop volumineux ;
- durée serveur > 60 s ;
- double appel avec même idempotency key ;
- traitement photo ;
- traitement FFmpeg portrait ;
- traitement FFmpeg paysage ;
- conservation audio ;
- sortie MP4 lisible ;
- échec worker et retry ;
- sync Drive ;
- Drive indisponible sans perte du média principal.

## 16.4 Tests appareils réels obligatoires

- iPhone Safari récent ;
- au moins un iPhone plus ancien encore ciblé ;
- Android Chrome récent ;
- Android milieu ou entrée de gamme ;
- Safari macOS ;
- Chrome desktop.

Les tests de caméra et de partage natif ne doivent pas être considérés comme validés uniquement via émulation desktop.

## 16.5 Tests de sécurité

- upload sans session ;
- session réutilisée abusivement ;
- fichier renommé avec faux MIME ;
- payload HTML/Sheet formula ;
- double clic ;
- flood ;
- fichier exécutable ;
- URL signée expirée ;
- tentative d’accès anonyme au bucket ;
- vérification de l’absence de secrets dans le bundle.

---

# 17. Critères d’acceptation révisés et vérifiables

## Fonctionnels

- le QR code ouvre le site en HTTPS ;
- l’accueil se charge correctement sur réseau mobile ;
- l’utilisateur peut prendre ou importer une photo ;
- l’utilisateur peut enregistrer ou importer une vidéo ;
- la vidéo s’arrête automatiquement à 60 secondes ;
- l’audio est conservé ;
- la caméra avant/arrière fonctionne lorsque plusieurs caméras sont présentes ;
- « Aucun filtre » est disponible ;
- les cinq filtres portrait sont disponibles ;
- cinq variantes paysage réelles sont disponibles avant de valider le support paysage complet ;
- le swipe et les boutons fonctionnent ;
- l’aperçu live correspond au rendu final ;
- la photo finale contient réellement le filtre ;
- la vidéo finale contient réellement le filtre et sort en MP4 H.264/AAC ;
- l’utilisateur peut recommencer ;
- le prénom et le message sont facultatifs ;
- l’utilisateur peut partager/enregistrer, envoyer, ou faire les deux ;
- l’upload affiche une progression réelle ;
- une interruption peut être reprise ;
- aucun double envoi n’est créé avec la même clé ;
- la confirmation n’apparaît qu’après réponse serveur vérifiée ;
- l’utilisateur peut créer un nouveau souvenir.

## Sécurité

- aucun secret dans le frontend ;
- médias privés ;
- aucune permission `ANYONE_WITH_LINK` ;
- routes protégées contre les abus ;
- type, taille et durée vérifiés côté serveur ;
- identifiants idempotents ;
- données de Sheet neutralisées ;
- données personnelles minimisées.

## Compatibilité

- iPhone Safari ;
- Android Chrome ;
- Safari macOS ;
- Chrome desktop ;
- portrait et paysage ;
- fallback import si caméra indisponible ;
- fallback téléchargement si Web Share indisponible.

## Qualité

- lint sans erreur ;
- TypeScript sans erreur ;
- build réussi ;
- tests automatisés réussis ;
- tests réels documentés ;
- code modulaire ;
- documentation d’installation ;
- `.env.example` sans secret ;
- rapport final des fichiers modifiés.

---

# 18. Ordre conseillé d’implémentation

## Phase 0 — Sécuriser l’existant

1. créer une branche ;
2. inventorier le projet ;
3. sauvegarder une version fonctionnelle ;
4. supprimer le faux succès `no-cors` ou désactiver l’envoi tant qu’il n’est pas vérifiable ;
5. arrêter le partage public Drive ;
6. désactiver l’endpoint legacy en production s’il reste ouvert sans protection.

## Phase 1 — Refactor frontend

1. initialiser Vite + TypeScript ;
2. extraire CSS ;
3. créer la machine d’état ;
4. porter les fonctionnalités photo existantes ;
5. ajouter tests de base ;
6. conserver le design.

## Phase 2 — Filtres et photo finale

1. créer `filters.json` ;
2. normaliser les cinq assets ;
3. miniatures ;
4. carousel swipe ;
5. aperçu live ;
6. fusion Canvas ;
7. partage natif ;
8. téléchargement fallback.

## Phase 3 — Backend d’upload sécurisé

1. base `memories` ;
2. bucket privé ;
3. URL signées ;
4. idempotence ;
5. progression ;
6. reprise ;
7. validations ;
8. anti-abus.

## Phase 4 — Caméra directe et vidéo

1. `getUserMedia` ;
2. flip caméra ;
3. MediaRecorder ;
4. timer ;
5. limite 60 s ;
6. import vidéo ;
7. métadonnées ;
8. tests appareils.

## Phase 5 — Composition vidéo serveur

1. worker FFmpeg ;
2. ffprobe ;
3. profils portrait/paysage ;
4. audio ;
5. job async ;
6. écran traitement ;
7. retry ;
8. suppression du brut.

## Phase 6 — Drive et administration

1. synchronisation privée vers dossier commun ;
2. statut Drive ;
3. fichier de configuration documenté ;
4. variantes paysage finales ;
5. interface admin ultérieure si nécessaire.

## Phase 7 — Validation finale

1. tests automatisés ;
2. tests iPhone/Android réels ;
3. test de charge événementiel ;
4. audit sécurité ;
5. audit accessibilité ;
6. documentation déploiement ;
7. répétition générale avant le mariage.

---

# 19. Décisions à prendre avant l’implémentation production

1. **Ordre officiel des prénoms :** `Salma & Soufiane` recommandé pour correspondre à la majorité des filtres.
2. **Création des cinq variantes paysage :** nécessaire pour satisfaire totalement le cahier des charges.
3. **Stockage primaire :** Supabase recommandé ; à confirmer.
4. **Service de traitement :** Cloud Run FFmpeg recommandé ; à confirmer.
5. **Google Drive :** archive privée commune, pas ingestion principale.
6. **Limite de taille vidéo :** recommandation initiale 150 Mo, à ajuster après tests.
7. **Qualité :** 1080p par défaut ; 4K optionnel, pas garanti sur tous les appareils.
8. **Email invité :** conserver comme option secondaire ou supprimer pour éviter les quotas.
9. **Durée de conservation du brut :** 24 à 72 heures après traitement recommandé.
10. **Accès administratif :** fichier JSON pour V1, interface protégée pour V2.

---

# 20. Conclusion

Le projet actuel constitue une bonne première version **photo uniquement**, simple et visuellement cohérente. Il ne couvre toutefois pas l’objectif demandé de caméra temps réel, vidéo 60 secondes, filtres dynamiques, partage natif, upload reprenable et stockage privé.

Les deux blocages les plus urgents sont indépendants de la future vidéo :

1. le frontend ne peut pas confirmer l’envoi à cause de `no-cors` ;
2. chaque photo est rendue accessible à toute personne disposant du lien.

La cible recommandée est une application web statique légère et modulaire, avec stockage objet privé, uploads signés et reprenables, puis traitement vidéo FFmpeg asynchrone. Google Drive reste utile comme archive privée finale. Les cinq filtres reçus peuvent être intégrés immédiatement pour le portrait, mais le support paysage complet nécessite cinq nouveaux assets graphiques.

---

# 21. Sources techniques officielles consultées

- [MDN — `getUserMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN — `MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [MDN — `MediaRecorder.isTypeSupported()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)
- [WebKit — MediaRecorder API](https://webkit.org/blog/11353/mediarecorder-api/)
- [MDN — `HTMLCanvasElement.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)
- [MDN — Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
- [MDN — `Navigator.canShare()`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare)
- [MDN — réponses opaques et `no-cors`](https://developer.mozilla.org/en-US/docs/Web/API/Response/type)
- [Google Apps Script — Web Apps](https://developers.google.com/apps-script/guides/web)
- [Google Apps Script — Quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Google Drive API — Imports avec reprise](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Google Drive API — Partage et permissions](https://developers.google.com/workspace/drive/api/guides/manage-sharing)
- [Supabase Storage — Uploads avec reprise](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Supabase Storage — Contrôle d’accès](https://supabase.com/docs/guides/storage/security/access-control)

