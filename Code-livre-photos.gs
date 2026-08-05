/**
 * ═══════════════════════════════════════════════════════
 * LIVRE PHOTOS SOUVENIRS — GOOGLE APPS SCRIPT
 * Salma & Soufiane · 23 octobre 2026
 * ═══════════════════════════════════════════════════════
 *
 * Backend Google Apps Script :
 * - enregistre les photos et vidéos dans Google Drive ;
 * - conserve les fichiers privés ;
 * - confirme les envois avec CacheService + PropertiesService ;
 * - permet au frontend de vérifier le statut réel par JSONP.
 *
 * ─────────────────────────────────────────────────────────
 * APRÈS CHAQUE MODIFICATION DE CE FICHIER :
 *   Déployer → Gérer les déploiements → (crayon) → Version : Nouvelle version
 *   Sinon l'ancienne version reste servie et rien ne change côté site.
 *
 * VÉRIFIER QUE LA BONNE VERSION EST EN LIGNE :
 *   Ouvrir <URL_DU_DEPLOIEMENT>?action=health et comparer « version »
 *   avec BACKEND_VERSION ci-dessous.
 *
 * VÉRIFIER LE DOSSIER DRIVE RÉELLEMENT UTILISÉ :
 *   Exécuter manuellement la fonction verifyDriveTarget()
 *   puis lire le journal (Affichage → Journaux).
 * ─────────────────────────────────────────────────────────
 */


/* ═══════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════ */

/**
 * Incrémenter à chaque modification, puis redéployer une NOUVELLE version.
 * C'est la seule façon fiable de savoir quelle version est réellement en ligne.
 */
const BACKEND_VERSION = '2026.08.05-1';

/**
 * Dossier Drive principal — VÉRIFIÉ le 5 août 2026 :
 *   12W1gstTtPzL4JFVq6MQWzvDa8FpbBy4b
 *     = « Livre Photos Souvenirs — Mariage S&S 📸 »
 *     créé le 30/03/2026, propriétaire soufiane.erd@gmail.com,
 *     lui-même rangé dans « Livre d'Or Audio — Mariage S&S 🎙️ ».
 *
 * L'identifiant 1FsZyN4zT_HkVbZcw-G6gil6tYug26IuY qui circulait dans
 * l'historique du projet N'EST PAS un dossier principal concurrent :
 * c'est le sous-dossier « Vidéos » situé À L'INTÉRIEUR du dossier ci-dessus
 * (créé le 04/08/2026 par setupDrive()). Il n'y a donc aucun conflit :
 * la valeur ci-dessous est la bonne, il ne faut pas la remplacer.
 *
 * En cas de doute, exécuter verifyDriveTarget() : la fonction journalise le
 * nom et l'URL du dossier réellement ciblé, ainsi que ceux de ses sous-dossiers.
 */
const DRIVE_MAIN_FOLDER_ID = '12W1gstTtPzL4JFVq6MQWzvDa8FpbBy4b';

const PHOTOS_FOLDER_NAME = 'Photos';
const VIDEOS_FOLDER_NAME = 'Vidéos';

/**
 * Facultatif. Laisser vide pour ne pas utiliser Google Sheets.
 */
const SHEET_ID = '';
const SHEET_TAB = 'Registre Souvenirs';

/**
 * Le cache rapide conserve les statuts pendant une heure.
 * PropertiesService les conserve jusqu'à six heures.
 */
const CACHE_EXPIRATION_SECONDS = 3600;
const STATUS_RETENTION_MS = 6 * 60 * 60 * 1000;

/**
 * Limites appliquées côté Google Apps Script.
 * Le frontend applique une marge de sécurité plus stricte.
 */
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 60;

const ALLOWED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov'
};

const STATUS_PREFIX = 'upload_';


/* ═══════════════════════════════════════════════════════
   RÉCEPTION D'UN MÉDIA
   ═══════════════════════════════════════════════════════ */

/**
 * Appelée automatiquement par le site.
 * Ne pas exécuter doPost manuellement depuis l'éditeur Apps Script.
 */
function doPost(e) {
  let uploadId = 'unknown';

  /**
   * Journal de diagnostic : renvoyé au frontend en cas d'échec.
   * Ne contient aucun secret : uniquement des métadonnées techniques.
   */
  const diagnostics = {
    step: 'reception',
    mediaType: null,
    mimeType: null,
    receivedBytes: null,
    duration: null,
    filename: null,
    version: BACKEND_VERSION
  };

  try {
    diagnostics.step = 'lecture_requete';

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Requête POST invalide.');
    }

    diagnostics.step = 'analyse_json';

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      throw new Error('Payload JSON invalide.');
    }

    diagnostics.step = 'identifiant';
    uploadId = validateUploadId_(data.uploadId || Utilities.getUuid());

    setStatus_(uploadId, 'PROCESSING', {
      message: 'Traitement du souvenir en cours.',
      version: BACKEND_VERSION
    });

    diagnostics.step = 'lecture_metadonnees';

    const mediaType = String(data.mediaType || '').toLowerCase().trim();
    const mimeType = normalizeMimeType_(data.mimeType || 'application/octet-stream');
    const mediaBase64 = normalizeBase64_(data.mediaBase64 || '');
    const duration = Number(data.duration || 0);
    const guestName = safeText_(data.guestName || 'Anonyme', 80);
    const message = safeText_(data.message || '', 500);
    const filterId = safeText_(data.filterId || 'none', 80);
    const filterBurned = data.filterBurned === true;
    const orientation = safeText_(data.orientation || 'unknown', 30);

    diagnostics.mediaType = mediaType;
    diagnostics.mimeType = mimeType;
    diagnostics.duration = duration;

    diagnostics.step = 'validation_metadonnees';
    validateMediaMetadata_(mediaType, mimeType, mediaBase64, duration);

    diagnostics.step = 'nom_de_fichier';
    const filename = normalizeFilename_(
      data.filename || (Date.now() + '_souvenir'),
      mimeType
    );
    diagnostics.filename = filename;

    diagnostics.step = 'decodage_base64';
    const fileBytes = Utilities.base64Decode(mediaBase64);
    const fileSize = fileBytes.length;
    diagnostics.receivedBytes = fileSize;

    diagnostics.step = 'validation_fichier';
    validateDecodedFile_(mediaType, mimeType, fileSize, duration);

    diagnostics.step = 'creation_blob';
    const blob = Utilities.newBlob(fileBytes, mimeType, filename);

    diagnostics.step = 'ouverture_dossier_drive';
    const mainFolder = DriveApp.getFolderById(DRIVE_MAIN_FOLDER_ID);

    const photosFolder = getOrCreateFolder_(mainFolder, PHOTOS_FOLDER_NAME);
    const videosFolder = getOrCreateFolder_(mainFolder, VIDEOS_FOLDER_NAME);

    const destinationFolder = (mediaType === 'photo') ? photosFolder : videosFolder;

    diagnostics.step = 'ecriture_drive';

    /**
     * Le fichier est créé sans setSharing() :
     * il reste privé dans le Drive du propriétaire.
     */
    const driveFile = destinationFolder.createFile(blob);
    const fileId = driveFile.getId();

    diagnostics.step = 'journalisation';

    if (SHEET_ID && SHEET_ID.trim() !== '') {
      logToSheet_(
        uploadId, guestName, message, mediaType, filename, mimeType,
        fileSize, duration, orientation, filterId, filterBurned,
        fileId, destinationFolder.getName()
      );
    }

    diagnostics.step = 'termine';

    setStatus_(uploadId, 'COMPLETED', {
      message: 'Souvenir enregistré dans Google Drive.',
      fileId: fileId,
      filename: filename,
      mediaType: mediaType,
      folder: destinationFolder.getName(),
      size: fileSize,
      version: BACKEND_VERSION
    });

    return buildResponse_({
      success: true,
      uploadId: uploadId,
      status: 'COMPLETED',
      filename: filename,
      folder: destinationFolder.getName(),
      size: fileSize,
      version: BACKEND_VERSION
    });

  } catch (error) {
    const safeError = getPublicErrorMessage_(error, diagnostics);

    Logger.log(
      'Erreur doPost [' + uploadId + '] étape=' + diagnostics.step +
      ' mime=' + diagnostics.mimeType +
      ' taille=' + diagnostics.receivedBytes +
      ' duree=' + diagnostics.duration +
      ' : ' + String(error)
    );

    setStatus_(uploadId, 'FAILED', {
      error: safeError,
      diagnostics: diagnostics
    });

    return buildResponse_({
      success: false,
      uploadId: uploadId,
      status: 'FAILED',
      error: safeError,
      diagnostics: diagnostics
    });
  }
}


/* ═══════════════════════════════════════════════════════
   CONSULTATION DU STATUT
   ═══════════════════════════════════════════════════════ */

/**
 * Exemples :
 *   /exec?action=status&uploadId=identifiant&prefix=nomCallback
 *   /exec?action=health
 */
function doGet(e) {
  try {
    const parameters = (e && e.parameter) ? e.parameter : {};
    const action = String(parameters.action || '');

    if (action === 'status') {
      const uploadId = validateUploadId_(parameters.uploadId || '');
      const callbackName = validateCallbackName_(parameters.prefix || '');
      const statusData = getStatus_(uploadId);
      const jsonResponse = JSON.stringify(statusData);

      /**
       * Ne pas supprimer le statut ici :
       * le frontend peut avoir besoin de le relire plusieurs fois.
       */
      return ContentService
        .createTextOutput(callbackName + '(' + jsonResponse + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    if (action === 'health') {
      let folderName = null;
      let photosOk = false;
      let videosOk = false;
      let driveError = null;

      try {
        const mainFolder = DriveApp.getFolderById(DRIVE_MAIN_FOLDER_ID);
        folderName = mainFolder.getName();
        photosOk = !!getOrCreateFolder_(mainFolder, PHOTOS_FOLDER_NAME);
        videosOk = !!getOrCreateFolder_(mainFolder, VIDEOS_FOLDER_NAME);
      } catch (folderError) {
        driveError = 'Dossier Drive inaccessible pour le compte exécutant le script.';
      }

      /**
       * L'identifiant du dossier n'est volontairement pas exposé publiquement.
       */
      return ContentService
        .createTextOutput(JSON.stringify({
          success: !driveError,
          service: 'Livre Photos Souvenirs',
          status: driveError ? 'DEGRADED' : 'OPERATIONAL',
          version: BACKEND_VERSION,
          driveFolderName: folderName,
          photosFolderReady: photosOk,
          videosFolderReady: videosOk,
          limits: {
            maxPhotoBytes: MAX_PHOTO_BYTES,
            maxVideoBytes: MAX_VIDEO_BYTES,
            maxVideoSeconds: MAX_VIDEO_DURATION_SECONDS,
            allowedPhotoMimeTypes: ALLOWED_PHOTO_MIME_TYPES,
            allowedVideoMimeTypes: ALLOWED_VIDEO_MIME_TYPES
          },
          error: driveError,
          date: new Date().toISOString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput('Backend Livre Photos opérationnel — version ' + BACKEND_VERSION + '.')
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService
      .createTextOutput('Erreur de requête.')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}


/* ═══════════════════════════════════════════════════════
   GESTION DES STATUTS
   ═══════════════════════════════════════════════════════ */

function setStatus_(uploadId, status, extraData) {
  const data = Object.assign(
    {
      uploadId: uploadId,
      status: status,
      updatedAt: new Date().toISOString(),
      expiresAt: Date.now() + STATUS_RETENTION_MS
    },
    extraData || {}
  );

  const jsonString = JSON.stringify(data);
  const key = STATUS_PREFIX + uploadId;

  try {
    CacheService.getScriptCache().put(key, jsonString, CACHE_EXPIRATION_SECONDS);
  } catch (cacheError) {
    Logger.log('Avertissement CacheService : ' + String(cacheError));
  }

  try {
    PropertiesService.getScriptProperties().setProperty(key, jsonString);
  } catch (propertyError) {
    Logger.log('Avertissement PropertiesService : ' + String(propertyError));
  }
}


function getStatus_(uploadId) {
  const key = STATUS_PREFIX + uploadId;
  let jsonString = null;

  try {
    jsonString = CacheService.getScriptCache().get(key);
  } catch (cacheError) {
    jsonString = null;
  }

  if (!jsonString) {
    try {
      jsonString = PropertiesService.getScriptProperties().getProperty(key);
    } catch (propertyError) {
      jsonString = null;
    }
  }

  if (!jsonString) {
    return {
      uploadId: uploadId,
      status: 'PENDING',
      message: 'En attente de réception.'
    };
  }

  try {
    const statusData = JSON.parse(jsonString);

    if (statusData.expiresAt && Number(statusData.expiresAt) < Date.now()) {
      deleteStatus_(uploadId);
      return { uploadId: uploadId, status: 'PENDING', message: 'Statut expiré.' };
    }

    return statusData;

  } catch (parseError) {
    return { uploadId: uploadId, status: 'FAILED', error: 'Le statut est illisible.' };
  }
}


function deleteStatus_(uploadId) {
  const key = STATUS_PREFIX + uploadId;
  try { CacheService.getScriptCache().remove(key); } catch (cacheError) {}
  try { PropertiesService.getScriptProperties().deleteProperty(key); } catch (propertyError) {}
}


/**
 * Peut être exécutée manuellement ou par un déclencheur horaire.
 * Supprime les anciens statuts de PropertiesService.
 */
function cleanupOldStatuses() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProperties = scriptProperties.getProperties();
  const now = Date.now();
  let deletedCount = 0;

  Object.keys(allProperties).forEach(function (key) {
    if (key.indexOf(STATUS_PREFIX) !== 0) return;

    try {
      const data = JSON.parse(allProperties[key]);
      if (data.expiresAt && Number(data.expiresAt) < now) {
        scriptProperties.deleteProperty(key);
        deletedCount++;
      }
    } catch (error) {
      scriptProperties.deleteProperty(key);
      deletedCount++;
    }
  });

  Logger.log('Statuts supprimés : ' + deletedCount);
}


/* ═══════════════════════════════════════════════════════
   VALIDATIONS
   ═══════════════════════════════════════════════════════ */

function validateMediaMetadata_(mediaType, mimeType, mediaBase64, duration) {
  if (mediaType !== 'photo' && mediaType !== 'video') {
    throw new Error('Type de média invalide.');
  }

  if (!mediaBase64) {
    throw new Error('Payload incomplet : aucun média reçu.');
  }

  const maxBytes = (mediaType === 'photo') ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;

  /**
   * Un fichier encodé en base64 est environ 33 % plus grand.
   */
  const approximateMaximumBase64Length = Math.ceil(maxBytes * 4 / 3) + 4096;

  if (mediaBase64.length > approximateMaximumBase64Length) {
    throw new Error(
      mediaType === 'photo'
        ? 'La photo dépasse la taille maximale autorisée.'
        : 'La vidéo dépasse la taille maximale de 25 Mo.'
    );
  }

  if (mediaType === 'photo' && ALLOWED_PHOTO_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Format photo non autorisé.');
  }

  if (mediaType === 'video' && ALLOWED_VIDEO_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Format vidéo non autorisé.');
  }

  if (mediaType === 'video' &&
      (!isFiniteNumber_(duration) || duration <= 0 || duration > MAX_VIDEO_DURATION_SECONDS)) {
    throw new Error('La vidéo dépasse la durée maximale de 60 secondes.');
  }
}


function validateDecodedFile_(mediaType, mimeType, fileSize, duration) {
  if (!fileSize || fileSize <= 0) {
    throw new Error('Le fichier reçu est vide.');
  }

  if (mediaType === 'photo') {
    if (ALLOWED_PHOTO_MIME_TYPES.indexOf(mimeType) === -1) {
      throw new Error('Format photo non autorisé.');
    }
    if (fileSize > MAX_PHOTO_BYTES) {
      throw new Error('La photo dépasse la taille maximale autorisée.');
    }
  }

  if (mediaType === 'video') {
    if (ALLOWED_VIDEO_MIME_TYPES.indexOf(mimeType) === -1) {
      throw new Error('Format vidéo non autorisé.');
    }
    if (fileSize > MAX_VIDEO_BYTES) {
      throw new Error('La vidéo dépasse la taille maximale de 25 Mo.');
    }
    if (!isFiniteNumber_(duration) || duration <= 0 || duration > MAX_VIDEO_DURATION_SECONDS) {
      throw new Error('La vidéo dépasse la durée maximale de 60 secondes.');
    }
  }
}


function isFiniteNumber_(value) {
  return typeof value === 'number' && isFinite(value);
}


function validateUploadId_(uploadId) {
  const value = String(uploadId || '').trim();

  if (!value || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new Error('Identifiant d’upload invalide.');
  }

  return value;
}


function validateCallbackName_(callbackName) {
  const value = String(callbackName || '').trim();

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/.test(value)) {
    throw new Error('Nom de callback invalide.');
  }

  return value;
}


function normalizeMimeType_(mimeType) {
  return String(mimeType || '').toLowerCase().split(';')[0].trim();
}


function normalizeBase64_(value) {
  return String(value || '')
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s/g, '');
}


function normalizeFilename_(filename, mimeType) {
  const extension = MIME_EXTENSIONS[mimeType];

  if (!extension) {
    throw new Error('Extension de fichier inconnue.');
  }

  const sanitizedName = sanitize_(filename || (Date.now() + '_souvenir'));
  const nameWithoutExtension = sanitizedName.replace(/\.[^.]+$/, '');

  return nameWithoutExtension.slice(0, 100) + extension;
}


function sanitize_(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim()
    .slice(0, 120);
}


function safeText_(value, maximumLength) {
  return String(value || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, maximumLength);
}


/**
 * N'expose jamais de détail interne. Les messages autorisés sont explicites
 * pour l'invité ; tout le reste devient un message générique, complété par
 * les diagnostics techniques (étape, MIME, taille, durée).
 */
function getPublicErrorMessage_(error, diagnostics) {
  const message = (error && error.message) ? String(error.message) : '';

  const allowedMessages = [
    'Requête POST invalide.',
    'Payload JSON invalide.',
    'Identifiant d’upload invalide.',
    'Payload incomplet : aucun média reçu.',
    'Type de média invalide.',
    'Format photo non autorisé.',
    'Format vidéo non autorisé.',
    'La photo dépasse la taille maximale autorisée.',
    'La vidéo dépasse la taille maximale de 25 Mo.',
    'La vidéo dépasse la durée maximale de 60 secondes.',
    'Le fichier reçu est vide.',
    'Extension de fichier inconnue.'
  ];

  if (allowedMessages.indexOf(message) !== -1) {
    if (message === 'Format vidéo non autorisé.' && diagnostics && diagnostics.mimeType) {
      return 'Format vidéo non autorisé (' + diagnostics.mimeType + ').';
    }
    if (message === 'Format photo non autorisé.' && diagnostics && diagnostics.mimeType) {
      return 'Format photo non autorisé (' + diagnostics.mimeType + ').';
    }
    return message;
  }

  if (diagnostics && diagnostics.step === 'ouverture_dossier_drive') {
    return 'Le dossier Google Drive de destination est inaccessible.';
  }
  if (diagnostics && diagnostics.step === 'ecriture_drive') {
    return 'L’écriture dans Google Drive a échoué.';
  }

  return 'Erreur interne lors de l’enregistrement du souvenir.';
}


/* ═══════════════════════════════════════════════════════
   GOOGLE DRIVE
   ═══════════════════════════════════════════════════════ */

function getOrCreateFolder_(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(folderName);
}


/**
 * À exécuter manuellement une seule fois.
 * Crée les sous-dossiers et affiche leurs URL.
 */
function setupDrive() {
  const mainFolder = DriveApp.getFolderById(DRIVE_MAIN_FOLDER_ID);
  const photosFolder = getOrCreateFolder_(mainFolder, PHOTOS_FOLDER_NAME);
  const videosFolder = getOrCreateFolder_(mainFolder, VIDEOS_FOLDER_NAME);

  Logger.log('Dossier principal : ' + mainFolder.getName());
  Logger.log('Photos : ' + photosFolder.getUrl());
  Logger.log('Vidéos : ' + videosFolder.getUrl());
}


/**
 * VÉRIFICATION DE LA DESTINATION RÉELLE.
 *
 * Exécuter cette fonction depuis l'éditeur, puis lire le journal.
 * Elle indique sans ambiguïté quel dossier reçoit les souvenirs.
 */
function verifyDriveTarget() {
  Logger.log('Version du backend : ' + BACKEND_VERSION);
  Logger.log('Compte exécutant : ' + Session.getEffectiveUser().getEmail());
  Logger.log('DRIVE_MAIN_FOLDER_ID configuré : ' + DRIVE_MAIN_FOLDER_ID);

  let mainFolder;
  try {
    mainFolder = DriveApp.getFolderById(DRIVE_MAIN_FOLDER_ID);
  } catch (error) {
    Logger.log('ÉCHEC : ce compte ne peut pas ouvrir ce dossier. ' + String(error));
    return;
  }

  Logger.log('Nom du dossier : ' + mainFolder.getName());
  Logger.log('URL du dossier : ' + mainFolder.getUrl());

  const photosFolder = getOrCreateFolder_(mainFolder, PHOTOS_FOLDER_NAME);
  const videosFolder = getOrCreateFolder_(mainFolder, VIDEOS_FOLDER_NAME);

  Logger.log('Photos → ' + photosFolder.getUrl() + ' (fichiers : ' + countFiles_(photosFolder) + ')');
  Logger.log('Vidéos → ' + videosFolder.getUrl() + ' (fichiers : ' + countFiles_(videosFolder) + ')');
}


/**
 * RANGEMENT DES ANCIENS FICHIERS — à exécuter manuellement, une seule fois.
 *
 * Les souvenirs envoyés avant la mise en place des sous-dossiers se trouvent
 * à la racine du dossier principal. Cette fonction les déplace dans « Photos »
 * ou « Vidéos » selon leur type réel.
 *
 * Sûre par conception : ne touche jamais aux dossiers, ne supprime rien,
 * et ignore tout fichier qui n'est ni une image ni une vidéo.
 *
 * Le menu « Exécuter » ne permet pas de passer d'argument : utiliser les deux
 * fonctions sans paramètre définies juste en dessous.
 */

/**
 * ÉTAPE 1 — SIMULATION. Ne déplace rien, journalise seulement ce qui serait fait.
 * Sélectionner « rangerAnciensFichiers_Simulation » dans le menu déroulant,
 * puis cliquer sur Exécuter.
 */
function rangerAnciensFichiers_Simulation() {
  tidyLegacyFiles(true);
}

/**
 * ÉTAPE 2 — RANGEMENT RÉEL. À exécuter après avoir vérifié la simulation.
 * Sélectionner « rangerAnciensFichiers_Reel » dans le menu déroulant,
 * puis cliquer sur Exécuter.
 */
function rangerAnciensFichiers_Reel() {
  tidyLegacyFiles(false);
}

function tidyLegacyFiles(dryRun) {
  const simulation = dryRun === true;
  const mainFolder = DriveApp.getFolderById(DRIVE_MAIN_FOLDER_ID);
  const photosFolder = getOrCreateFolder_(mainFolder, PHOTOS_FOLDER_NAME);
  const videosFolder = getOrCreateFolder_(mainFolder, VIDEOS_FOLDER_NAME);

  Logger.log(simulation
    ? '=== SIMULATION : aucun fichier ne sera déplacé ==='
    : '=== RANGEMENT RÉEL ===');
  Logger.log('Dossier : ' + mainFolder.getName());

  const files = mainFolder.getFiles();
  let movedPhotos = 0;
  let movedVideos = 0;
  let ignored = 0;

  while (files.hasNext()) {
    const file = files.next();
    const mime = String(file.getMimeType() || '');

    let destination = null;
    if (mime.indexOf('image/') === 0) destination = photosFolder;
    else if (mime.indexOf('video/') === 0) destination = videosFolder;

    if (!destination) {
      ignored++;
      Logger.log('IGNORÉ   ' + file.getName() + ' (' + mime + ')');
      continue;
    }

    if (!simulation) {
      destination.addFile(file);
      mainFolder.removeFile(file);
    }

    if (destination === photosFolder) movedPhotos++;
    else movedVideos++;

    Logger.log(
      (simulation ? 'À DÉPLACER ' : 'DÉPLACÉ    ') +
      file.getName() + ' → ' + destination.getName()
    );
  }

  Logger.log('---');
  Logger.log('Photos : ' + movedPhotos + ' · Vidéos : ' + movedVideos + ' · ignorés : ' + ignored);
  Logger.log('Photos contient désormais ' + countFiles_(photosFolder) + ' fichier(s).');
  Logger.log('Vidéos contient désormais ' + countFiles_(videosFolder) + ' fichier(s).');
}


function countFiles_(folder) {
  const files = folder.getFiles();
  let count = 0;
  while (files.hasNext() && count < 1000) { files.next(); count++; }
  return count;
}


/* ═══════════════════════════════════════════════════════
   GOOGLE SHEETS — FACULTATIF
   ═══════════════════════════════════════════════════════ */

function logToSheet_(memoryId, name, message, type, filename, mime, size,
                     duration, orientation, filter, filterBurned, driveId, folder) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_TAB);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_TAB);

      const headers = [
        'Memory ID', 'Date', 'Prénom', 'Message', 'Type', 'Nom fichier',
        'MIME', 'Taille (octets)', 'Durée', 'Orientation', 'Filtre',
        'Filtre incrusté', 'ID Drive', 'Dossier'
      ];

      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#5D262C')
        .setFontColor('#F9F7F2');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      memoryId, new Date(), name, message, type, filename, mime, size,
      duration, orientation, filter, filterBurned ? 'oui' : 'non', driveId, folder
    ]);

  } catch (error) {
    Logger.log('Erreur Google Sheets : ' + String(error));
  }
}


/* ═══════════════════════════════════════════════════════
   RÉPONSE HTTP
   ═══════════════════════════════════════════════════════ */

function buildResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
