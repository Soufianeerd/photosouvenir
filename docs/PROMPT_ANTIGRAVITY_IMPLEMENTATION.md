# PROMPT ANTIGRAVITY — Implémentation complète du livre photo et vidéo avec filtres

Tu travailles sur le projet `livre-photos`, une application web mobile destinée aux invités du mariage de **Salma et Soufiane**, célébré le **23 octobre 2026**.

Ta mission est d’analyser le dépôt réel, de conserver toutes les fonctionnalités utiles existantes, puis d’implémenter complètement une expérience photo et vidéo mobile avec filtres, partage natif, upload sécurisé et traitement vidéo fiable.

Ne te contente pas d’une maquette. Les boutons, la caméra, l’enregistrement, la limite de 60 secondes, la fusion des filtres, les uploads, les fallbacks et les messages d’erreur doivent fonctionner réellement.

---

# 1. Règles absolues de travail

1. Analyse d’abord l’intégralité du projet avant toute modification.
2. Ne suppose jamais qu’une fonctionnalité ou une dépendance existe : vérifie-la.
3. Lis tous les fichiers, y compris les assets, configurations, scripts et fichiers cachés pertinents.
4. Si Git est configuré, vérifie l’état du dépôt et crée une branche propre, par exemple `feature/photo-video-filters`, sans écraser le travail non commité.
5. Ne supprime aucune fonctionnalité existante sans justification.
6. Évite toute régression du parcours photo actuel.
7. Respecte les conventions réelles du projet ; si aucune convention n’existe, établis-en une et documente-la.
8. Ne place jamais de secret, token privé, clé de service, refresh token ou clé `service_role` dans le frontend.
9. Ne prétends jamais qu’un envoi a réussi sans confirmation vérifiable du serveur.
10. Ne simule pas une progression d’upload ou un traitement vidéo.
11. Ne promets pas une sauvegarde automatique dans la galerie mobile : utilise la feuille de partage native puis un téléchargement fallback.
12. N’utilise pas Google Apps Script comme voie principale pour l’upload de vidéos volumineuses.
13. Corrige toutes les erreurs de lint, TypeScript, build et tests introduites par tes changements.
14. Documente précisément les fichiers créés, modifiés, déplacés ou conservés en legacy.
15. À la fin, fournis un rapport complet des modifications, des tests exécutés, des résultats et des éventuels paramètres externes restant à configurer.

---

# 2. Contexte réel déjà détecté

Le périmètre fourni comporte actuellement :

```text
livre-photos/
├── filtres/
│   ├── filtreS&S.png
│   ├── filtreS&S2.png
│   ├── filtreSoufiane&Salma.png
│   ├── filtreSoufiane&Salma2.png
│   └── filtreSoufiane&Salma3.png
├── Code-livre-photos.gs
└── index.html
```

Vérifie les chemins et noms réels dans le dépôt avant d’agir. Les fichiers fournis pour l’analyse pouvaient porter un suffixe de téléchargement, mais les chemins ci-dessus sont ceux visibles dans le projet.

## Stack détectée

- frontend HTML/CSS/JavaScript natif ;
- aucun framework confirmé ;
- CSS et JavaScript actuellement inline dans `index.html` ;
- backend Google Apps Script ;
- Google Drive comme stockage direct ;
- Google Sheets facultatif ;
- MailApp facultatif ;
- aucune base de données confirmée ;
- aucun système de tests confirmé ;
- aucun gestionnaire de dépendances confirmé ;
- cinq PNG RGBA transparents 1024 × 1536, ratio portrait 2:3 ;
- aucune variante paysage fournie ;
- aucune logique de filtre présente dans le code actuel ;
- aucune vidéo présente dans le code actuel.

## Fonctionnalités existantes à préserver

Le projet permet actuellement :

- saisie du prénom ;
- relation facultative ;
- prise d’une photo via un champ fichier avec `capture="environment"` ;
- import d’une photo depuis la galerie ;
- drag and drop desktop ;
- aperçu ;
- compression JPEG Canvas ;
- légende facultative ;
- envoi vers Google Apps Script ;
- sauvegarde Drive ;
- journal Google Sheet facultatif ;
- copie email facultative ;
- téléchargement du Blob ;
- confirmation visuelle.

## Défauts existants à corriger impérativement

1. Le frontend utilise `mode: 'no-cors'` et considère l’envoi comme réussi sans pouvoir lire la réponse serveur.
2. Le backend applique `ANYONE_WITH_LINK`, ce qui rend les médias accessibles à toute personne disposant du lien.
3. L’endpoint Apps Script public n’a ni rate limiting, ni idempotence, ni anti-spam, ni validation binaire robuste.
4. Le serveur fait confiance au MIME et à la taille déclarés par le client.
5. Le fallback HEIC peut envoyer des octets HEIC sous un nom/MIME JPEG.
6. La progression d’upload n’est pas réelle.
7. Le double clic peut créer des doublons.
8. La résolution maximale actuelle de 1400 px ne correspond pas à un objectif HD/4K.
9. Le code est monolithique.
10. Le zoom mobile est limité par `user-scalable=no`, ce qui nuit à l’accessibilité.
11. Le journal Sheet doit être protégé contre les valeurs interprétées comme formules.
12. Les données injectées avec `innerHTML` doivent être échappées ou remplacées par `textContent`.
13. Le dossier Drive est recherché par nom au lieu d’utiliser un ID stable.

---

# 3. Objectif produit

Créer une expérience mobile sans installation accessible par QR code.

Parcours attendu :

1. accueil très court ;
2. choix Photo ou Vidéo ;
3. consentement bref ;
4. autorisation caméra et microphone uniquement après action utilisateur ;
5. aperçu caméra en direct ;
6. choix caméra avant/arrière ;
7. filtre live facultatif ;
8. capture photo ou vidéo ;
9. vidéo limitée strictement à 60 secondes ;
10. prévisualisation ;
11. recommencer ou conserver ;
12. prénom et message facultatifs ;
13. choisir : partager/enregistrer, envoyer aux mariés, ou faire les deux ;
14. progression réelle ;
15. confirmation vérifiée ;
16. nouveau souvenir.

L’interface doit rester élégante, simple, adaptée à des utilisateurs peu techniques et cohérente avec le thème :

- crème ;
- bordeaux ;
- doré ;
- typographies élégantes ;
- papeterie de mariage haut de gamme ;
- grands contrôles tactiles ;
- texte minimal pendant la capture.

Adopte par défaut la forme **Salma & Soufiane** et la date **23 octobre 2026**, sauf si les fichiers réels ou une configuration existante imposent explicitement autre chose. Signale toute incohérence avant normalisation.

---

# 4. Architecture cible à implémenter

## 4.1 Frontend

Migre le frontend vers :

- Vite ;
- TypeScript ;
- HTML et CSS natifs ;
- aucun framework UI lourd ;
- modules séparés ;
- tests Vitest ;
- tests E2E Playwright ;
- build statique déployable sur Netlify ou hébergeur équivalent.

Si le projet contient déjà une autre stack ou un build réel non visible dans l’inventaire initial, adapte l’architecture à cette stack et explique la décision. Ne crée pas une seconde application parallèle.

## 4.2 Stockage primaire recommandé

Implémente une couche de stockage abstraite avec une implémentation de production basée sur :

- Supabase Storage privé ;
- Supabase Postgres ;
- URLs d’upload signées et courtes ;
- RLS stricte ;
- upload direct depuis le client ;
- TUS/reprise pour les vidéos et fichiers volumineux ;
- aucun secret privilégié dans le bundle.

Si les variables Supabase ne sont pas disponibles :

- crée `.env.example` ;
- implémente les fonctions et schémas complets ;
- ajoute un mode mock/local clairement identifié ;
- ne marque pas la production comme fonctionnelle tant que les variables et migrations ne sont pas appliquées.

## 4.3 Backend/API

Créer des routes ou fonctions serveur équivalentes à :

- `create-upload-session` ;
- `complete-upload` ;
- `processing-status` ;
- `drive-sync` facultatif ;
- endpoint de santé non sensible.

Responsabilités :

- valider le code événement ;
- appliquer le rate limiting ;
- vérifier les limites ;
- créer une clé idempotente ;
- générer une URL signée ;
- confirmer l’objet uploadé ;
- enregistrer les métadonnées ;
- lancer le traitement vidéo ;
- renvoyer des erreurs structurées ;
- ne jamais exposer de secrets.

## 4.4 Traitement vidéo

Créer un service `video-worker` conteneurisé et documenté, prévu pour Cloud Run ou service équivalent, avec :

- Node.js/TypeScript ou stack cohérente ;
- FFmpeg et ffprobe ;
- téléchargement privé du média brut ;
- validation de durée ;
- sélection de la variante de filtre ;
- overlay ;
- conservation audio ;
- sortie MP4 H.264/AAC ;
- `yuv420p` ;
- `faststart` ;
- upload privé du résultat ;
- mise à jour du statut ;
- logs structurés ;
- retry idempotent ;
- suppression du brut selon la politique configurée.

Ne tente pas d’exécuter FFmpeg dans une fonction serverless trop limitée si le dépôt ou la plateforme ne garantit pas la durée, la mémoire et la taille nécessaires.

## 4.5 Google Drive

Conserve Google Drive comme archive facultative :

- synchronisation backend après production du média final ;
- dossier commun privé ;
- ID du dossier dans une variable serveur ;
- OAuth serveur ou compte de service ayant accès au dossier/Drive partagé ;
- aucun partage `ANYONE_WITH_LINK` ;
- aucune clé Google dans le frontend ;
- statut de synchronisation distinct du statut de conservation dans le stockage primaire.

Déplace `Code-livre-photos.gs` vers `legacy/` si le script n’est plus utilisé directement. Ne le supprime pas sans conserver son historique ou une copie documentée.

---

# 5. Arborescence cible

Adapte les noms aux conventions réelles du dépôt, mais vise une séparation équivalente :

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
│   └── filters/
│       ├── filters.json
│       ├── portrait/
│       ├── landscape/
│       └── thumbnails/
├── src/
│   ├── main.ts
│   ├── config/
│   ├── state/
│   ├── ui/
│   │   ├── screens/
│   │   └── components/
│   ├── media/
│   ├── filters/
│   ├── upload/
│   ├── share/
│   ├── storage/
│   ├── security/
│   ├── utils/
│   └── styles/
├── netlify/functions/
├── supabase/migrations/
├── video-worker/
├── tests/
└── legacy/
```

Fichiers minimaux attendus :

```text
src/main.ts
src/config/app-config.ts
src/config/limits.ts
src/state/app-state.ts
src/state/app-machine.ts
src/media/camera-service.ts
src/media/media-recorder-service.ts
src/media/import-media.ts
src/media/photo-compositor.ts
src/media/video-capabilities.ts
src/media/object-url-registry.ts
src/filters/filter-types.ts
src/filters/filter-registry.ts
src/filters/filter-renderer.ts
src/filters/filter-preloader.ts
src/upload/upload-manager.ts
src/upload/resumable-upload.ts
src/upload/upload-session-api.ts
src/upload/offline-queue.ts
src/share/share-service.ts
src/storage/draft-store.ts
src/security/validation.ts
src/security/filename.ts
src/ui/components/filter-carousel.ts
src/ui/components/capture-controls.ts
src/ui/components/recording-timer.ts
src/ui/components/upload-progress.ts
src/ui/components/consent-notice.ts
src/ui/components/error-panel.ts
src/ui/screens/welcome-screen.ts
src/ui/screens/media-choice-screen.ts
src/ui/screens/camera-screen.ts
src/ui/screens/preview-screen.ts
src/ui/screens/delivery-screen.ts
src/ui/screens/upload-screen.ts
src/ui/screens/success-screen.ts
public/filters/filters.json
supabase/migrations/001_memories.sql
supabase/migrations/002_processing_jobs.sql
supabase/migrations/003_storage_policies.sql
video-worker/Dockerfile
video-worker/src/ffmpeg.ts
video-worker/src/probe.ts
video-worker/src/filter-overlay.ts
```

Tu peux regrouper certains petits fichiers si cela améliore réellement la cohérence, mais ne recrée pas un monolithe.

---

# 6. Machine d’état obligatoire

Ne gère pas le parcours uniquement avec des `display:none` et des appels libres.

Prévois au minimum les états :

```text
WELCOME
MEDIA_CHOICE
CONSENT
REQUESTING_PERMISSIONS
CAMERA_READY
RECORDING_VIDEO
CAPTURED
PREVIEW
DETAILS
DELIVERY_CHOICE
PREPARING_MEDIA
CREATING_UPLOAD_SESSION
UPLOADING
UPLOAD_PAUSED
PROCESSING_VIDEO
SUCCESS
RECOVERABLE_ERROR
FATAL_ERROR
```

Transitions contrôlées :

- aucune capture sans flux prêt ;
- aucun second enregistrement pendant un enregistrement ;
- aucun upload sans média final ou brut validé ;
- aucun succès sans réponse serveur ;
- aucune perte silencieuse du Blob ;
- nettoyage centralisé lors du reset ;
- libération des pistes caméra/micro ;
- révocation des Object URLs ;
- arrêt des timers ;
- annulation des requêtes lorsque nécessaire.

---

# 7. Capture caméra

## 7.1 Contraintes générales

- exiger HTTPS en production ;
- demander la permission uniquement après toucher/clic ;
- afficher un message avant la permission ;
- utiliser `playsinline`, `autoplay`, `muted` sur l’aperçu ;
- gérer les safe areas iOS ;
- gérer caméra avant et arrière ;
- arrêter les anciennes pistes avant de changer de caméra ;
- gérer l’absence de caméra ;
- fournir un import galerie fallback.

## 7.2 Contraintes initiales proposées

Photo/vidéo portrait :

```ts
{
  audio: videoMode,
  video: {
    facingMode: selectedFacingMode,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 }
  }
}
```

Ne suppose pas que ces valeurs seront respectées. Lis les settings réels de la piste.

## 7.3 Bascule caméra

- détecter les périphériques après permission ;
- bouton flip visible uniquement si plusieurs entrées vidéo existent ou si la bascule est possible ;
- préférer `deviceId` exact lorsque disponible ;
- fallback avec `facingMode` ;
- réafficher le filtre sans rechargement.

## 7.4 Erreurs à traiter

- `NotAllowedError` ;
- `NotFoundError` ;
- `NotReadableError` ;
- `OverconstrainedError` ;
- `AbortError` ;
- absence de `navigator.mediaDevices` ;
- flux interrompu ;
- page passée en arrière-plan ;
- caméra utilisée par une autre application.

Pour chaque erreur, afficher :

- un message compréhensible ;
- un bouton réessayer ;
- un bouton importer depuis la galerie lorsque pertinent.

---

# 8. Capture photo

1. capturer la frame vidéo réelle ;
2. prendre en compte le ratio et l’orientation ;
3. éviter une inversion involontaire de la caméra avant ;
4. créer un Canvas final ;
5. dessiner le média ;
6. dessiner le filtre actif ;
7. exporter un Blob ;
8. créer une miniature ;
9. extraire largeur, hauteur et orientation ;
10. supprimer les métadonnées sensibles par réencodage ;
11. proposer Recommencer / Conserver.

Résolution :

- essayer de conserver jusqu’à 3840 px côté long lorsque possible ;
- fallback 2560 puis 2048 ;
- utiliser une stratégie de mémoire sûre ;
- ne pas réduire systématiquement à 1400 px ;
- éviter les Data URLs pour les gros fichiers ;
- utiliser `toBlob()`.

Formats de sortie :

- JPEG haute qualité par défaut ;
- WebP uniquement si le partage et le stockage cible sont compatibles ;
- extension cohérente avec le MIME réel.

---

# 9. Capture vidéo 60 secondes

## 9.1 Enregistrement

- utiliser `MediaRecorder` lorsque disponible ;
- sélectionner le MIME avec `MediaRecorder.isTypeSupported()` ;
- tester plusieurs candidats sans hard-coder un seul codec ;
- collecter des chunks réguliers, par exemple toutes les secondes ;
- afficher le timer `00:00` à `01:00` ;
- avertir visuellement à 50 secondes ;
- arrêter automatiquement à 60 secondes ;
- appeler `requestData()` avant `stop()` si pertinent ;
- attendre l’événement `stop` avant de finaliser le Blob ;
- conserver l’audio ;
- libérer les pistes ensuite.

## 9.2 Limite stricte

La limite doit être appliquée :

- par timer client ;
- par vérification de la durée après capture/import ;
- par ffprobe côté serveur ;
- par FFmpeg avec une limite de sortie défensive ;
- par rejet explicite si le fichier dépasse la tolérance autorisée.

Tolérance technique maximale recommandée : 60 500 ms pour compenser les événements asynchrones, mais la sortie finale doit être tronquée à 60 secondes maximum.

## 9.3 MIME candidats

Construis une liste testée au runtime, par exemple :

```ts
const candidates = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];
```

Utilise le premier type réellement supporté. Si aucun type n’est disponible, propose l’import vidéo comme fallback.

## 9.4 Rotation pendant l’enregistrement

- figer l’orientation de sortie au démarrage ;
- afficher « Gardez votre téléphone dans cette orientation » ;
- ne pas redimensionner le canvas de sortie en cours d’enregistrement ;
- adapter les contrôles visuels sans modifier le flux final ;
- enregistrer l’orientation initiale.

## 9.5 Aperçu

- lecture locale avec contrôles ;
- audio activable par l’utilisateur ;
- Recommencer ;
- Conserver ;
- changer de filtre avant traitement final si le filtre n’est pas déjà brûlé dans le brut ;
- ne pas relancer la caméra tant que l’utilisateur n’a pas demandé Recommencer.

---

# 10. Filtres dynamiques

## 10.1 Assets initiaux

Intègre les cinq fichiers existants comme variantes portrait. Conserve les originaux et crée des copies aux noms normalisés :

```text
filter-ss-floral-burgundy-01.png
filter-ss-ivory-gold-02.png
filter-salma-soufiane-gold-03.png
filter-salma-soufiane-gold-04.png
filter-salma-soufiane-ivory-05.png
```

Ne modifie pas graphiquement les originaux sans nécessité. Génère des miniatures légères.

## 10.2 Variantes paysage

Les cinq assets reçus sont uniquement en 1024 × 1536 portrait.

Tu ne dois pas prétendre avoir un support paysage parfait en étirant ou en recadrant ces images.

Implémente :

- le contrat de variante paysage ;
- les emplacements de fichiers ;
- la validation de configuration ;
- un fallback propre si une variante manque.

Si aucune variante graphique paysage n’est disponible dans le dépôt :

- marque explicitement la variante comme absente ;
- autorise « Aucun filtre » en paysage ;
- ou utilise un fallback `contain` clairement identifié ;
- ajoute un rapport « assets paysage requis » ;
- ne coche pas le critère « cinq filtres paysage finalisés ».

Si tu peux générer des variantes techniques sans déformer les éléments, crée-les dans un dossier distinct et indique qu’une validation graphique humaine reste obligatoire.

## 10.3 `filters.json`

Créer un fichier central avec :

- version ;
- ID unique ;
- nom ;
- catégorie ;
- actif/inactif ;
- ordre ;
- dates de disponibilité ;
- médias compatibles ;
- miniature ;
- variante portrait ;
- variante paysage ;
- dimensions intrinsèques ;
- stratégie de fit ;
- zones de sécurité ;
- version d’asset ;
- statut archived sans suppression physique.

Inclure une entrée système `none` en première position.

## 10.4 Carousel

- défilement horizontal tactile ;
- `scroll-snap` ;
- swipe gauche/droite ;
- boutons précédent/suivant ;
- clavier ;
- `aria-selected` ;
- indicateur visible ;
- aperçu instantané ;
- préchargement du courant et des voisins ;
- lazy load des autres ;
- cache navigateur ;
- aucune requête répétée inutile.

## 10.5 Rendu live

Pour la prévisualisation caméra :

- superposer l’image du filtre au-dessus de la vidéo ;
- `pointer-events:none` ;
- dimensions synchronisées avec la zone média ;
- ne pas inclure les contrôles dans la capture ;
- ne pas étirer le filtre ;
- respecter le crop réel appliqué au média final.

## 10.6 Rendu photo final

Le rendu Canvas doit reproduire exactement :

- même crop ;
- même miroir ;
- même orientation ;
- même variante ;
- même position ;
- même échelle.

---

# 11. Composition vidéo finale

## 11.1 Chemin principal obligatoire : serveur

Le média brut est uploadé avec :

- `filter_id` ;
- orientation ;
- dimensions ;
- durée ;
- MIME ;
- identifiant événement ;
- clé idempotente.

Le worker :

1. télécharge le brut par URL privée ;
2. vérifie le type avec ffprobe ;
3. vérifie la durée ;
4. sélectionne le filtre configuré ;
5. applique le crop/scale ;
6. applique l’overlay ;
7. conserve l’audio ;
8. produit MP4 H.264/AAC ;
9. applique `yuv420p` et `faststart` ;
10. crée une miniature ;
11. upload le résultat dans un bucket privé ;
12. met le job à `ready` ;
13. supprime les fichiers temporaires ;
14. gère les erreurs et retries.

## 11.2 Sorties

Portrait : profil 1080 × 1920.  
Paysage : profil 1920 × 1080.  
Fallback faible : 720 × 1280 ou 1280 × 720.

Conserve le ratio correct sans déformation. Si le média ne correspond pas au ratio, applique une stratégie documentée :

- `cover` avec crop centré, ou
- recadrage contrôlé selon les dimensions de l’aperçu.

Le crop final doit correspondre à ce que l’invité a vu.

## 11.3 Fast path navigateur facultatif

Tu peux implémenter un chemin expérimental :

- Canvas rendu en temps réel ;
- `canvas.captureStream()` ;
- ajout de la piste audio originale ;
- MediaRecorder du flux composé.

Conditions :

- feature detection stricte ;
- test automatique court avant activation ;
- pas de perte audio ;
- fallback serveur obligatoire ;
- ne pas utiliser ce chemin si le navigateur ne produit pas un fichier fiable.

---

# 12. Import galerie

Créer une option secondaire :

- photo existante ;
- vidéo existante ;
- accept `image/*,video/*` ;
- validation du MIME déclaré ;
- validation du contenu réel côté serveur ;
- extraction de la durée ;
- rejet > 60 secondes ;
- gestion HEIC/HEIF ;
- aucune incohérence extension/MIME ;
- orientation EXIF correcte ;
- message explicite si le navigateur ne peut pas prévisualiser le codec ;
- upload serveur pour conversion si nécessaire.

---

# 13. Partage et enregistrement sur le téléphone

Créer `share-service.ts`.

Ordre :

1. convertir le Blob final en `File` avec nom et MIME corrects ;
2. vérifier `navigator.canShare({ files: [file] })` ;
3. appeler `navigator.share({ files, title, text })` dans un handler utilisateur ;
4. afficher un message expliquant que la feuille native permet AirDrop, réseaux sociaux et enregistrement ;
5. fallback avec un lien `download` ;
6. sur iOS, ne pas affirmer que le téléchargement a été placé automatiquement dans Photos ;
7. fournir une aide courte si nécessaire : « Dans le menu de partage, choisissez Enregistrer l’image ou Enregistrer la vidéo ».

Nom de fichier :

```text
salma-soufiane-souvenir-20261023-HHmmss-<id>.jpg
salma-soufiane-souvenir-20261023-HHmmss-<id>.mp4
```

Le nom doit être ASCII, sûr, unique et cohérent avec le MIME.

---

# 14. Choix de livraison

Écran simple avec :

- `Partager ou enregistrer` ;
- `Envoyer aux mariés` ;
- `Faire les deux`.

Ne demande pas à l’invité de choisir Salma ou Soufiane par défaut. Utilise une destination commune.

Prévois techniquement un champ :

```ts
type Destination = 'common' | 'salma' | 'soufiane' | 'both';
```

Mais masque les destinations avancées sauf si la configuration l’active.

Le partage local doit rester possible même si l’upload distant échoue.

---

# 15. Upload sécurisé et reprenable

## 15.1 Session

Le client envoie uniquement les métadonnées nécessaires à `create-upload-session` :

- code événement ;
- `client_request_id` UUID ;
- type média ;
- taille ;
- MIME ;
- durée estimée ;
- dimensions ;
- orientation ;
- filtre ;
- destination ;
- consentement ;
- token anti-abus si requis.

Le serveur :

- valide ;
- applique les limites ;
- crée ou retrouve le record idempotent ;
- renvoie une URL signée ou session TUS ;
- ne renvoie aucun secret global.

## 15.2 Progression

- photos petites : upload standard avec progression réelle si l’API choisie le permet ;
- vidéos : TUS ;
- afficher octets envoyés, pourcentage et statut ;
- ne pas inventer un pourcentage pendant un `fetch` opaque ;
- permettre pause/reprise lorsque supporté ;
- écouter `online`/`offline` ;
- reprendre après retour réseau.

## 15.3 Idempotence

- `client_request_id` unique en base ;
- même ID conservé lors d’un retry ;
- contrainte unique ;
- le serveur retourne le record existant ;
- bouton désactivé pendant la soumission ;
- verrou applicatif contre double clic.

## 15.4 Limites proposées

Centraliser dans `limits.ts` et serveur :

```text
photo originale : 25 Mo maximum
photo finale : 15 Mo maximum
vidéo : 60 secondes maximum
vidéo brute : 150 Mo maximum par défaut
message invité : 240 caractères maximum
prénom : 80 caractères maximum
```

Rendre ces valeurs configurables et identiques client/serveur.

---

# 16. Base de données

Créer les migrations SQL.

## 16.1 Table `memories`

Champs minimum :

```text
id uuid primary key
client_request_id uuid unique not null
public_event_code text not null
media_type text not null
original_mime_type text
final_mime_type text
original_name text
final_name text
raw_path text
final_path text
thumbnail_path text
size_bytes bigint
final_size_bytes bigint
duration_ms integer
width integer
height integer
orientation text
filter_id text
guest_name text
guest_message text
destination text
upload_status text
processing_status text
drive_sync_status text
consent_at timestamptz
created_at timestamptz default now()
uploaded_at timestamptz
processed_at timestamptz
sha256 text
error_code text
```

Ajouter des contraintes `CHECK` et index utiles.

## 16.2 Table `processing_jobs`

- `id` ;
- `memory_id` unique ;
- statut ;
- tentatives ;
- date prochaine tentative ;
- début/fin ;
- code erreur ;
- message technique limité ;
- timestamps.

## 16.3 RLS et Storage

- buckets privés ;
- aucune lecture publique ;
- aucun upload anonyme général ;
- upload seulement via token signé ;
- backend privilégié uniquement dans les fonctions/worker ;
- URLs de téléchargement finales signées et courtes.

---

# 17. Métadonnées

Enregistrer :

- identifiant unique ;
- type média ;
- nom original ;
- nom final ;
- date création ;
- date upload ;
- date traitement ;
- durée ;
- largeur ;
- hauteur ;
- orientation ;
- filtre ;
- taille originale ;
- taille finale ;
- MIME ;
- statut upload ;
- statut traitement ;
- statut Drive ;
- destination ;
- prénom facultatif ;
- message facultatif ;
- consentement ;
- checksum facultatif ;
- code erreur.

Ne collecte pas plus de données personnelles que nécessaire.

---

# 18. Confidentialité et sécurité

## 18.1 Consentement UI

Afficher avant l’envoi :

> La caméra et le microphone servent uniquement à créer ce souvenir. Vous pouvez l’enregistrer sans l’envoyer. Si vous choisissez « Envoyer aux mariés », le média sera conservé dans leur album privé et ne sera pas publié automatiquement.

## 18.2 Validations

Client et serveur :

- type ;
- extension ;
- taille ;
- durée ;
- dimensions ;
- nom ;
- texte ;
- filtre existant et actif ;
- destination autorisée ;
- code événement ;
- expiration de session.

Serveur uniquement :

- magic bytes ;
- ffprobe ;
- rate limit ;
- quotas événementiels ;
- idempotence ;
- vérification de l’objet réellement stocké ;
- scan de contenu raisonnable ;
- normalisation du fichier final.

## 18.3 En-têtes

Configurer au minimum :

- `Content-Security-Policy` ;
- `X-Content-Type-Options: nosniff` ;
- `Referrer-Policy` ;
- `Permissions-Policy` pour caméra, micro et web-share ;
- `Strict-Transport-Security` si plateforme compatible ;
- règles de cache adaptées.

La CSP doit autoriser uniquement les domaines réellement utilisés.

## 18.4 Anti-abus

- code événement dans le QR ;
- session courte ;
- rate limiting IP/session ;
- limite de volume ;
- limite de tentatives ;
- Turnstile adaptatif ou équivalent ;
- ne pas imposer un captcha visible à chaque invité si le trafic est normal ;
- logs et alertes sur pics.

## 18.5 Google Sheet legacy

Si le journal Sheet est conservé :

- neutraliser les valeurs commençant par `=`, `+`, `-`, `@` ;
- limiter les longueurs ;
- ne pas stocker de données sensibles inutiles ;
- utiliser un ID de fichier et des statuts privés ;
- ne pas créer de lien public.

---

# 19. Gestion des erreurs

Créer des codes applicatifs stables, par exemple :

```text
CAMERA_PERMISSION_DENIED
MIC_PERMISSION_DENIED
CAMERA_NOT_FOUND
CAMERA_BUSY
MEDIA_API_UNSUPPORTED
RECORDER_UNSUPPORTED
UNSUPPORTED_MEDIA_TYPE
MEDIA_TOO_LARGE
VIDEO_TOO_LONG
FILTER_LOAD_FAILED
FILTER_VARIANT_MISSING
PHOTO_COMPOSITION_FAILED
UPLOAD_SESSION_FAILED
UPLOAD_INTERRUPTED
UPLOAD_EXPIRED
UPLOAD_VALIDATION_FAILED
PROCESSING_FAILED
DRIVE_SYNC_FAILED
SHARE_UNSUPPORTED
STORAGE_QUOTA_EXCEEDED
```

Pour chaque erreur :

- message utilisateur court ;
- détail technique dans les logs seulement ;
- action de récupération ;
- bouton réessayer ;
- fallback galerie ou téléchargement si pertinent ;
- aucune perte silencieuse du média local.

Messages recommandés :

- « L’accès à la caméra a été refusé. Autorisez-le dans les réglages ou choisissez un fichier depuis votre galerie. »
- « Le microphone est nécessaire uniquement pour le son de la vidéo. »
- « Cette vidéo dépasse 60 secondes. Choisissez une vidéo plus courte. »
- « Envoi en pause. Nous reprendrons lorsque la connexion sera disponible. »
- « Le traitement de la vidéo a échoué. Votre fichier brut est conservé temporairement ; réessayez. »
- « Le souvenir est enregistré dans l’album privé, mais la copie Drive est encore en attente. »

---

# 20. Performance

- lazy load des filtres ;
- miniatures WebP ;
- préchargement courant + voisins ;
- pas de dépendance lourde inutile ;
- pas de base64 pour les vidéos ;
- Blob et streams ;
- libération des pistes caméra ;
- révocation des Object URLs ;
- nettoyage des Canvas ;
- chunks MediaRecorder réguliers ;
- 1080p par défaut ;
- 720p fallback ;
- 4K seulement si réellement supporté ;
- compression photo adaptative ;
- éviter les longs traitements sur le thread principal ;
- utiliser Worker/OffscreenCanvas uniquement si compatible et utile ;
- afficher des états de chargement réels.

Prévoir un mode réseau limité :

- afficher la taille estimée ;
- proposer 720p pour la vidéo ;
- ne pas charger tous les filtres immédiatement ;
- reprendre l’upload.

---

# 21. Accessibilité

- supprimer `user-scalable=no` ;
- taille de texte lisible ;
- zones tactiles d’au moins environ 44 px ;
- focus visible ;
- navigation clavier desktop ;
- boutons réels, pas `div onclick` ;
- `aria-live` pour statuts ;
- `aria-selected` pour filtres ;
- libellés des icônes ;
- contrastes suffisants ;
- `prefers-reduced-motion` ;
- ne pas communiquer uniquement par couleur ;
- texte alternatif ou éléments décoratifs masqués ;
- ordre de focus logique.

---

# 22. Tests obligatoires

## 22.1 Tests unitaires

- config filtres valide/invalide ;
- filtre `none` ;
- sélection portrait/paysage ;
- variante absente ;
- géométrie du rendu ;
- nom de fichier ;
- MIME et extension ;
- limite 60 secondes ;
- machine d’état ;
- idempotence ;
- cleanup Object URLs ;
- Web Share/fallback ;
- validations ;
- messages d’erreur.

## 22.2 Tests d’intégration

- capture photo ;
- capture vidéo courte ;
- arrêt automatique 60 s avec fake timers quand possible ;
- audio présent ;
- import photo ;
- import vidéo ;
- vidéo > 60 s ;
- cinq filtres portrait ;
- aucun filtre ;
- swipe ;
- upload ;
- progression ;
- perte réseau ;
- reprise ;
- double clic ;
- même idempotency key ;
- traitement photo ;
- job vidéo ;
- Drive en échec sans perte du stockage principal.

## 22.3 E2E

Créer des tests Playwright pour les états UI et les fallbacks. Mocke `getUserMedia`, `MediaRecorder`, Web Share et les APIs serveur lorsque nécessaire.

## 22.4 Appareils réels

Documenter une checklist manuelle :

- Safari iPhone ;
- Chrome Android ;
- Safari macOS ;
- Chrome desktop ;
- portrait ;
- paysage ;
- caméra avant ;
- caméra arrière ;
- partage AirDrop ;
- enregistrement via feuille de partage ;
- réseau 4G instable ;
- refus permissions ;
- rotation ;
- appareil à faible mémoire.

Ne déclare pas les tests caméra mobile réels réussis s’ils n’ont pas été exécutés.

## 22.5 Sécurité

- endpoint sans token ;
- URL signée expirée ;
- faux MIME ;
- fichier exécutable ;
- formule Sheet ;
- HTML dans les champs ;
- flood ;
- double envoi ;
- accès public au bucket ;
- recherche de secrets dans le build ;
- vérification de l’absence de `ANYONE_WITH_LINK`.

---

# 23. Critères d’acceptation

La tâche est acceptée uniquement si :

1. le projet est analysé avant modification ;
2. le build fonctionne ;
3. les fonctionnalités photo existantes sont conservées ou améliorées ;
4. la caméra live fonctionne lorsque le navigateur la supporte ;
5. la galerie reste disponible en fallback ;
6. photo et vidéo sont disponibles ;
7. l’enregistrement vidéo s’arrête à 60 secondes maximum ;
8. l’audio est conservé ;
9. la caméra avant/arrière est gérée ;
10. aucun filtre est disponible ;
11. les cinq filtres portrait sont intégrés ;
12. le swipe fonctionne ;
13. les filtres sont configurés hors de la logique principale ;
14. l’ajout d’un filtre ne nécessite pas de modifier le moteur ;
15. la photo finale contient réellement le filtre ;
16. la vidéo finale contient réellement le filtre via un traitement fiable ;
17. le rendu n’est ni étiré ni déformé ;
18. les variantes paysage manquantes sont gérées honnêtement et signalées ;
19. l’aperçu est disponible ;
20. Recommencer fonctionne ;
21. le prénom et le message sont facultatifs ;
22. l’utilisateur peut partager/enregistrer ;
23. l’utilisateur peut envoyer aux mariés ;
24. il peut faire les deux ;
25. la feuille de partage native est utilisée quand possible ;
26. un téléchargement fallback existe ;
27. la progression est réelle ;
28. l’upload vidéo est reprenable ;
29. les doubles envois sont empêchés ;
30. le succès est confirmé par le serveur ;
31. les médias sont privés ;
32. aucun secret n’est exposé ;
33. le type, la taille et la durée sont vérifiés côté serveur ;
34. les routes ont une protection anti-abus ;
35. les erreurs sont récupérables ;
36. le flux caméra est libéré ;
37. les Object URLs sont nettoyées ;
38. l’interface est cohérente avec le mariage ;
39. le zoom et l’accessibilité ne sont pas bloqués ;
40. lint, typage, build et tests passent ;
41. les paramètres externes restants sont documentés ;
42. un rapport final précis est fourni.

Ne considère pas le critère paysage complet comme réussi tant que cinq variantes paysage graphiquement valides ne sont pas présentes et validées.

---

# 24. Ordre d’implémentation imposé

## Étape 1 — Audit et baseline

- inventaire ;
- état Git ;
- exécution de la version actuelle ;
- liste des fonctionnalités ;
- liste des erreurs ;
- copie de sécurité ;
- tests baseline minimaux.

## Étape 2 — Correction des risques critiques

- retirer le faux succès `no-cors` ;
- arrêter le partage public ;
- désactiver ou isoler l’endpoint legacy non protégé ;
- corriger MIME/extension ;
- empêcher les doubles clics.

## Étape 3 — Refactor modulaire

- Vite/TypeScript ;
- extraction CSS/JS ;
- machine d’état ;
- config ;
- tests ;
- conservation visuelle.

## Étape 4 — Photo + filtres

- config des cinq filtres ;
- carousel ;
- swipe ;
- aperçu live ;
- composition Canvas ;
- preview ;
- partage/téléchargement.

## Étape 5 — Backend privé

- migrations ;
- Storage ;
- RLS ;
- sessions signées ;
- idempotence ;
- progression ;
- validations ;
- anti-abus.

## Étape 6 — Caméra et vidéo

- getUserMedia ;
- flip ;
- MediaRecorder ;
- MIME runtime ;
- timer ;
- 60 s ;
- import vidéo ;
- fallbacks.

## Étape 7 — Worker FFmpeg

- traitement ;
- audio ;
- MP4 ;
- portrait/paysage ;
- statuts ;
- retry ;
- cleanup.

## Étape 8 — Drive archive

- sync privée ;
- statut séparé ;
- retry ;
- documentation credentials serveur.

## Étape 9 — Tests et finition

- unitaires ;
- intégration ;
- E2E ;
- sécurité ;
- accessibilité ;
- performance ;
- build production ;
- rapport.

---

# 25. Rapport final attendu d’Antigravity

À la fin, fournis exactement :

## A. Résumé

- architecture avant ;
- architecture après ;
- décisions prises ;
- fonctionnalités implémentées.

## B. Fichiers

Pour chaque fichier modifié ou créé :

- chemin ;
- rôle ;
- changements ;
- dépendances ;
- points de vigilance.

## C. Backend et données

- migrations ;
- buckets ;
- RLS ;
- variables d’environnement ;
- endpoints ;
- worker ;
- Drive.

## D. Tests

- commandes exécutées ;
- résultats ;
- tests non exécutables dans l’environnement ;
- checklist appareils réels.

## E. Sécurité

- secrets ;
- partage public ;
- validations ;
- rate limiting ;
- idempotence ;
- politique de rétention.

## F. Configuration restante

- variables à remplir ;
- migrations à appliquer ;
- services à déployer ;
- cinq variantes paysage à fournir ou valider ;
- URL finale à mettre dans le QR code.

## G. Git

- branche ;
- commits ;
- état final du dépôt.

N’utilise pas les termes « terminé », « fonctionnel en production » ou « validé sur iPhone/Android » si les credentials, migrations, déploiements ou tests appareils réels n’ont pas été effectués.

