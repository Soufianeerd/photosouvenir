# Livre de Souvenirs — Salma & Soufiane

Application web légère permettant aux invités du mariage de laisser une photo
ou une courte vidéo, avec un filtre aux couleurs du mariage, directement depuis
leur téléphone après avoir scanné un QR code.

**Stack volontairement minimale** : HTML, CSS, JavaScript natif, et
Google Apps Script pour l'enregistrement dans Google Drive.
Aucun framework, aucun build, aucune dépendance npm.

---

## Structure

```
livre-photos/
├── index.html              Les quatre écrans (accueil, capture, aperçu, confirmation)
├── css/style.css           Styles — accueil élégant, capture et aperçu plein écran
├── js/app.js               Toute la logique : caméra, filtres, envoi, accessibilité
├── filters/
│   ├── filters.json        Configuration des filtres (source de vérité)
│   └── portrait/           Images de filtres plein format (PNG transparents)
├── Code-livre-photos.gs    Backend Google Apps Script
├── netlify.toml            Déploiement statique et en-têtes
├── tools/
│   └── make-thumbnails.sh  Génération des miniatures de filtres (optionnel)
└── README.md
```

---

## Parcours de l'invité

1. **Accueil** — prénom et message, tous deux facultatifs : ils ne bloquent
   jamais la création du souvenir.
2. **Capture plein écran** — la caméra occupe tout l'écran. Aucun filtre à ce
   stade. Appui bref = photo, appui prolongé = vidéo (60 s maximum). Un
   sélecteur *Photo / Vidéo* offre une alternative à l'appui prolongé.
3. **Aperçu** — c'est ici, et seulement ici, que l'on choisit un filtre :
   par glissement horizontal sur le média ou via les vignettes.
4. **Enregistrer ou partager**, et/ou **Envoyer aux mariés**. Les deux actions
   sont indépendantes.

---

## Ajouter ou modifier un filtre

Tout se pilote depuis `filters/filters.json`. Aucune modification de
`js/app.js` n'est nécessaire.

```json
{
  "id": "mon-nouveau-filtre",
  "name": "Nom affiché",
  "category": "elegant",
  "active": true,
  "order": 6,
  "mediaTypes": ["photo", "video"],
  "portrait": "filters/portrait/filter-mon-nouveau-filtre.png",
  "landscape": "filters/landscape/filter-mon-nouveau-filtre.png",
  "thumbnail": "filters/thumbnails/filter-mon-nouveau-filtre.png",
  "availableFrom": "2026-10-23T00:00:00Z",
  "availableUntil": "2026-10-24T23:59:59Z"
}
```

- `portrait`, `landscape` et `thumbnail` sont facultatifs. Sans eux, le chemin
  `filters/portrait/filter-<id>.png` est utilisé.
- `active: false` retire un filtre sans supprimer le fichier.
- L'entrée `none` (« Aucun filtre ») est obligatoire et ajoutée automatiquement
  si elle manque.
- Les filtres sont dessinés en mode *cover* : ils ne sont jamais étirés ni
  déformés, quelle que soit l'orientation.

### Miniatures

Les filtres plein format pèsent entre 2 et 2,8 Mo. Pour alléger le chargement
sur une connexion mobile faible :

```bash
bash tools/make-thumbnails.sh
```

Puis renseigner le champ `thumbnail` de chaque filtre dans `filters.json`.
Sans miniatures, l'application ne télécharge que les filtres proches de la
sélection courante ; avec miniatures, la bande de filtres devient quasi
instantanée.

---

## Backend Google Apps Script

### Déployer une modification

Une modification du fichier `.gs` **n'a aucun effet** tant qu'une nouvelle
version n'est pas déployée :

> Déployer → Gérer les déploiements → (crayon) → Version : **Nouvelle version** → Déployer

### Vérifier la version réellement en ligne

```
<URL_DU_DEPLOIEMENT>?action=health
```

Comparer le champ `version` avec la constante `BACKEND_VERSION` en haut de
`Code-livre-photos.gs`. Si les deux diffèrent, le déploiement n'a pas été mis
à jour.

### Vérifier le dossier Google Drive réellement utilisé

Exécuter manuellement la fonction `verifyDriveTarget()` depuis l'éditeur Apps
Script, puis lire le journal. Elle affiche le compte exécutant, le nom et
l'URL du dossier principal, ainsi que les URL des sous-dossiers `Photos` et
`Vidéos` et leur nombre de fichiers.

Si le dossier affiché n'est pas le bon album, modifier `DRIVE_MAIN_FOLDER_ID`
en haut du fichier, enregistrer, puis **redéployer une nouvelle version**.

### Limites appliquées

| | Backend | Frontend (marge de sécurité) |
|---|---|---|
| Photo | 20 Mo | 16 Mo |
| Vidéo | 25 Mo | 21 Mo |
| Durée vidéo | 60 s | 60 s |
| Photos acceptées | JPEG, PNG, WebP | JPEG produit |
| Vidéos acceptées | MP4, WebM, MOV | MP4 ou WebM selon le navigateur |

Le débit vidéo (2,5 Mbit/s + 128 kbit/s d'audio) est déduit de ces limites :
21 Mo × 8 ÷ 60 s ≈ 2,8 Mbit/s au total. Une vidéo de 60 s pèse environ 19,7 Mo.

### Confirmation d'envoi

Le frontend n'affiche **jamais** de confirmation sur la seule base d'une
requête `fetch`. Après le POST, il interroge
`?action=status&uploadId=…&prefix=…` en JSONP jusqu'à recevoir `COMPLETED`.
Un statut `FAILED` affiche le message du serveur et réactive le bouton.

---

## Développement local

La caméra exige HTTPS **ou** `localhost`. Ne pas ouvrir `index.html` avec le
protocole `file://` : les requêtes réseau et la caméra s'y comportent
différemment.

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Pour tester depuis un téléphone sur le réseau local, utiliser un tunnel HTTPS
(par exemple `npx localtunnel --port 8080`), car `http://192.168.x.x` ne donne
pas accès à la caméra.

---

## Déploiement Netlify

Site statique, sans build. `netlify.toml` définit :

- le dossier publié (racine du dépôt) ;
- un cache nul sur le HTML et sur `filters.json`, pour ne jamais servir une
  ancienne version après un déploiement ;
- un cache long sur les images de filtres ;
- `Permissions-Policy: camera=(self), microphone=(self)`, sans lequel certains
  navigateurs bloquent l'accès à la caméra.

Après déploiement, recharger en vidant le cache (ou en navigation privée) pour
éviter un faux résultat dû au cache du navigateur.

---

## Limites techniques connues

- **Filtre incrusté dans les vidéos** : le réencodage avec le filtre nécessite
  `HTMLVideoElement.captureStream()`. Cette API existe sur Chrome (Android et
  ordinateur) mais **pas sur Safari iOS**. Sur iPhone, la vidéo envoyée est donc
  la vidéo d'origine, sans filtre incrusté ; l'interface l'indique explicitement
  et l'identifiant du filtre choisi est tout de même transmis aux mariés.
- **Enregistrement dans la galerie iOS** : un site web ne peut pas écrire
  directement dans l'application Photos. Le bouton ouvre la feuille de partage
  native ; c'est l'invité qui choisit « Enregistrer la vidéo ». L'intitulé du
  bouton dit donc « Enregistrer ou partager », et non « Enregistré ».
- **Poids des filtres** : environ 13 Mo au total en plein format. Voir la
  section Miniatures ci-dessus.
