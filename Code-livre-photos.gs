/**
 * ═══════════════════════════════════════════════════════
 * LIVRE PHOTOS SOUVENIRS — GOOGLE APPS SCRIPT
 * Soufiane & Salma · 23 octobre 2026
 * ═══════════════════════════════════════════════════════
 *
 * Backend Google Apps Script :
 * - enregistre les photos et vidéos dans Google Drive ;
 * - conserve les fichiers privés ;
 * - confirme les envois avec CacheService + PropertiesService ;
 * - permet au frontend de vérifier le statut par JSONP.
 */


/* ═══════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════ */

const DRIVE_MAIN_FOLDER_ID = '12W1gstTtPzL4JFVq6MQWzvDa8FpbBy4b';

/**
 * Facultatif.
 * Laisse vide si tu ne souhaites pas utiliser Google Sheets.
 */
const SHEET_ID = '';
const SHEET_TAB = 'Registre Souvenirs';

/**
 * Le cache rapide conserve les statuts pendant une heure.
 * PropertiesService les conserve jusqu’à six heures.
 */
const CACHE_EXPIRATION_SECONDS = 3600;
const STATUS_RETENTION_MS = 6 * 60 * 60 * 1000;

/**
 * Limites appliquées côté Google Apps Script.
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
   RÉCEPTION D’UN MÉDIA
   ═══════════════════════════════════════════════════════ */

/**
 * Cette fonction est appelée automatiquement par le site.
 *
 * Ne pas exécuter doPost manuellement avec le bouton
 * « Exécuter » de Google Apps Script.
 */
function doPost(e) {
  let uploadId = 'unknown';

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Requête POST invalide.');
    }

    let data;

    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      throw new Error('Payload JSON invalide.');
    }

    uploadId = validateUploadId_(
      data.uploadId || Utilities.getUuid()
    );

    setStatus_(uploadId, 'PROCESSING', {
      message: 'Traitement du souvenir en cours.'
    });

    const mediaType = String(data.mediaType || '').toLowerCase().trim();

    const mimeType = normalizeMimeType_(
      data.mimeType || 'application/octet-stream'
    );

    const mediaBase64 = normalizeBase64_(
      data.mediaBase64 || ''
    );

    const duration = Number(data.duration || 0);

    const guestName = safeText_(
      data.guestName || 'Anonyme',
      80
    );

    const message = safeText_(
      data.message || '',
      500
    );

    const filterId = safeText_(
      data.filterId || 'none',
      80
    );

    const orientation = safeText_(
      data.orientation || 'unknown',
      30
    );

    validateMediaMetadata_(
      mediaType,
      mimeType,
      mediaBase64,
      duration
    );

    const filename = normalizeFilename_(
      data.filename || `${Date.now()}_souvenir`,
      mimeType
    );

    const fileBytes = Utilities.base64Decode(mediaBase64);
    const fileSize = fileBytes.length;

    validateDecodedFile_(
      mediaType,
      mimeType,
      fileSize,
      duration
    );

    const blob = Utilities.newBlob(
      fileBytes,
      mimeType,
      filename
    );

    const mainFolder = DriveApp.getFolderById(
      DRIVE_MAIN_FOLDER_ID
    );

    const photosFolder = getOrCreateFolder_(
      mainFolder,
      'Photos'
    );

    const videosFolder = getOrCreateFolder_(
      mainFolder,
      'Vidéos'
    );

    getOrCreateFolder_(
      mainFolder,
      'Temporaires'
    );

    const destinationFolder =
      mediaType === 'photo'
        ? photosFolder
        : videosFolder;

    /**
     * Le fichier est créé sans setSharing().
     * Il reste donc privé dans le Drive du propriétaire.
     */
    const driveFile = destinationFolder.createFile(blob);

    const fileId = driveFile.getId();

    if (SHEET_ID && SHEET_ID.trim() !== '') {
      logToSheet_(
        uploadId,
        guestName,
        message,
        mediaType,
        filename,
        mimeType,
        fileSize,
        duration,
        orientation,
        filterId,
        fileId,
        destinationFolder.getName()
      );
    }

    setStatus_(uploadId, 'COMPLETED', {
      message: 'Souvenir enregistré dans Google Drive.',
      fileId: fileId,
      filename: filename,
      mediaType: mediaType,
      size: fileSize
    });

    return buildResponse_({
      success: true,
      uploadId: uploadId,
      status: 'COMPLETED'
    });

  } catch (error) {
    const safeError = getPublicErrorMessage_(error);

    Logger.log(
      'Erreur doPost [' + uploadId + '] : ' +
      String(error)
    );

    setStatus_(uploadId, 'FAILED', {
      error: safeError
    });

    return buildResponse_({
      success: false,
      uploadId: uploadId,
      status: 'FAILED',
      error: safeError
    });
  }
}


/* ═══════════════════════════════════════════════════════
   CONSULTATION DU STATUT
   ═══════════════════════════════════════════════════════ */

/**
 * Exemple :
 *
 * /exec?action=status
 *      &uploadId=identifiant
 *      &prefix=nomCallback
 */
function doGet(e) {
  try {
    const parameters = e && e.parameter
      ? e.parameter
      : {};

    const action = String(
      parameters.action || ''
    );

    if (action === 'status') {
      const uploadId = validateUploadId_(
        parameters.uploadId || ''
      );

      const callbackName = validateCallbackName_(
        parameters.prefix || ''
      );

      const statusData = getStatus_(uploadId);
      const jsonResponse = JSON.stringify(statusData);

      /**
       * Ne pas supprimer le statut ici.
       * Le frontend peut avoir besoin de le relire plusieurs fois.
       */
      return ContentService
        .createTextOutput(
          `${callbackName}(${jsonResponse});`
        )
        .setMimeType(
          ContentService.MimeType.JAVASCRIPT
        );
    }

    if (action === 'health') {
      return ContentService
        .createTextOutput(
          JSON.stringify({
            success: true,
            service: 'Livre Photos Souvenirs',
            status: 'OPERATIONAL',
            date: new Date().toISOString()
          })
        )
        .setMimeType(
          ContentService.MimeType.JSON
        );
    }

    return ContentService
      .createTextOutput(
        'Backend Livre Photos opérationnel.'
      )
      .setMimeType(
        ContentService.MimeType.TEXT
      );

  } catch (error) {
    return ContentService
      .createTextOutput(
        'Erreur de requête.'
      )
      .setMimeType(
        ContentService.MimeType.TEXT
      );
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
    CacheService
      .getScriptCache()
      .put(
        key,
        jsonString,
        CACHE_EXPIRATION_SECONDS
      );
  } catch (cacheError) {
    Logger.log(
      'Avertissement CacheService : ' +
      String(cacheError)
    );
  }

  try {
    PropertiesService
      .getScriptProperties()
      .setProperty(
        key,
        jsonString
      );
  } catch (propertyError) {
    Logger.log(
      'Avertissement PropertiesService : ' +
      String(propertyError)
    );
  }
}


function getStatus_(uploadId) {
  const key = STATUS_PREFIX + uploadId;
  let jsonString = null;

  try {
    jsonString = CacheService
      .getScriptCache()
      .get(key);
  } catch (cacheError) {
    jsonString = null;
  }

  if (!jsonString) {
    try {
      jsonString = PropertiesService
        .getScriptProperties()
        .getProperty(key);
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

    if (
      statusData.expiresAt &&
      Number(statusData.expiresAt) < Date.now()
    ) {
      deleteStatus_(uploadId);

      return {
        uploadId: uploadId,
        status: 'PENDING',
        message: 'Statut expiré.'
      };
    }

    return statusData;

  } catch (parseError) {
    return {
      uploadId: uploadId,
      status: 'FAILED',
      error: 'Le statut est illisible.'
    };
  }
}


function deleteStatus_(uploadId) {
  const key = STATUS_PREFIX + uploadId;

  try {
    CacheService
      .getScriptCache()
      .remove(key);
  } catch (cacheError) {
    // Rien à faire.
  }

  try {
    PropertiesService
      .getScriptProperties()
      .deleteProperty(key);
  } catch (propertyError) {
    // Rien à faire.
  }
}


/**
 * Peut être exécutée manuellement ou par un déclencheur horaire.
 * Supprime les anciens statuts de PropertiesService.
 */
function cleanupOldStatuses() {
  const scriptProperties =
    PropertiesService.getScriptProperties();

  const allProperties =
    scriptProperties.getProperties();

  const now = Date.now();
  let deletedCount = 0;

  Object.keys(allProperties).forEach(function (key) {
    if (key.indexOf(STATUS_PREFIX) !== 0) {
      return;
    }

    try {
      const data = JSON.parse(
        allProperties[key]
      );

      if (
        data.expiresAt &&
        Number(data.expiresAt) < now
      ) {
        scriptProperties.deleteProperty(key);
        deletedCount++;
      }

    } catch (error) {
      scriptProperties.deleteProperty(key);
      deletedCount++;
    }
  });

  Logger.log(
    'Statuts supprimés : ' + deletedCount
  );
}


/* ═══════════════════════════════════════════════════════
   VALIDATIONS
   ═══════════════════════════════════════════════════════ */

function validateMediaMetadata_(
  mediaType,
  mimeType,
  mediaBase64,
  duration
) {
  if (
    mediaType !== 'photo' &&
    mediaType !== 'video'
  ) {
    throw new Error(
      'Type de média invalide.'
    );
  }

  if (!mediaBase64) {
    throw new Error(
      'Payload incomplet : aucun média reçu.'
    );
  }

  const maxBytes =
    mediaType === 'photo'
      ? MAX_PHOTO_BYTES
      : MAX_VIDEO_BYTES;

  /**
   * Un fichier encodé en base64 est environ 33 % plus grand.
   */
  const approximateMaximumBase64Length =
    Math.ceil(maxBytes * 4 / 3) + 4096;

  if (
    mediaBase64.length >
    approximateMaximumBase64Length
  ) {
    throw new Error(
      mediaType === 'photo'
        ? 'La photo dépasse la taille maximale autorisée.'
        : 'La vidéo dépasse la taille maximale de 25 Mo.'
    );
  }

  if (
    mediaType === 'photo' &&
    ALLOWED_PHOTO_MIME_TYPES.indexOf(mimeType) === -1
  ) {
    throw new Error(
      'Format photo non autorisé.'
    );
  }

  if (
    mediaType === 'video' &&
    ALLOWED_VIDEO_MIME_TYPES.indexOf(mimeType) === -1
  ) {
    throw new Error(
      'Format vidéo non autorisé.'
    );
  }

  if (
    mediaType === 'video' &&
    (!Number.isFinite(duration) ||
      duration < 0 ||
      duration > MAX_VIDEO_DURATION_SECONDS)
  ) {
    throw new Error(
      'La vidéo dépasse la durée maximale de 60 secondes.'
    );
  }
}


function validateDecodedFile_(
  mediaType,
  mimeType,
  fileSize,
  duration
) {
  if (!fileSize || fileSize <= 0) {
    throw new Error(
      'Le fichier reçu est vide.'
    );
  }

  if (mediaType === 'photo') {
    if (
      ALLOWED_PHOTO_MIME_TYPES.indexOf(mimeType) === -1
    ) {
      throw new Error(
        'Format photo non autorisé.'
      );
    }

    if (fileSize > MAX_PHOTO_BYTES) {
      throw new Error(
        'La photo dépasse la taille maximale autorisée.'
      );
    }
  }

  if (mediaType === 'video') {
    if (
      ALLOWED_VIDEO_MIME_TYPES.indexOf(mimeType) === -1
    ) {
      throw new Error(
        'Format vidéo non autorisé.'
      );
    }

    if (fileSize > MAX_VIDEO_BYTES) {
      throw new Error(
        'La vidéo dépasse la taille maximale de 25 Mo.'
      );
    }

    if (
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > MAX_VIDEO_DURATION_SECONDS
    ) {
      throw new Error(
        'La vidéo dépasse la durée maximale de 60 secondes.'
      );
    }
  }
}


function validateUploadId_(uploadId) {
  const value = String(uploadId || '').trim();

  if (
    !value ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(value)
  ) {
    throw new Error(
      'Identifiant d’upload invalide.'
    );
  }

  return value;
}


function validateCallbackName_(callbackName) {
  const value = String(
    callbackName || ''
  ).trim();

  if (
    !/^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/.test(value)
  ) {
    throw new Error(
      'Nom de callback invalide.'
    );
  }

  return value;
}


function normalizeMimeType_(mimeType) {
  return String(mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}


function normalizeBase64_(value) {
  return String(value || '')
    .replace(
      /^data:[^;]+;base64,/i,
      ''
    )
    .replace(/\s/g, '');
}


function normalizeFilename_(filename, mimeType) {
  const extension =
    MIME_EXTENSIONS[mimeType];

  if (!extension) {
    throw new Error(
      'Extension de fichier inconnue.'
    );
  }

  const sanitizedName = sanitize_(
    filename || `${Date.now()}_souvenir`
  );

  const nameWithoutExtension =
    sanitizedName.replace(/\.[^.]+$/, '');

  return (
    nameWithoutExtension.slice(0, 100) +
    extension
  );
}


function sanitize_(value) {
  return String(value || '')
    .replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      '_'
    )
    .trim()
    .slice(0, 120);
}


function safeText_(value, maximumLength) {
  return String(value || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, maximumLength);
}


function getPublicErrorMessage_(error) {
  const message =
    error && error.message
      ? String(error.message)
      : '';

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

  if (
    allowedMessages.indexOf(message) !== -1
  ) {
    return message;
  }

  return 'Erreur interne lors de l’enregistrement du souvenir.';
}


/* ═══════════════════════════════════════════════════════
   GOOGLE DRIVE
   ═══════════════════════════════════════════════════════ */

function getOrCreateFolder_(
  parentFolder,
  folderName
) {
  const folders =
    parentFolder.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parentFolder.createFolder(
    folderName
  );
}


/**
 * À exécuter manuellement une seule fois.
 *
 * Sélectionne « setupDrive » dans la liste des fonctions,
 * puis clique sur « Exécuter ».
 */
function setupDrive() {
  const mainFolder =
    DriveApp.getFolderById(
      DRIVE_MAIN_FOLDER_ID
    );

  const photosFolder =
    getOrCreateFolder_(
      mainFolder,
      'Photos'
    );

  const videosFolder =
    getOrCreateFolder_(
      mainFolder,
      'Vidéos'
    );

  const temporaryFolder =
    getOrCreateFolder_(
      mainFolder,
      'Temporaires'
    );

  Logger.log(
    'Dossier principal : ' +
    mainFolder.getName()
  );

  Logger.log(
    'Photos : ' +
    photosFolder.getUrl()
  );

  Logger.log(
    'Vidéos : ' +
    videosFolder.getUrl()
  );

  Logger.log(
    'Temporaires : ' +
    temporaryFolder.getUrl()
  );
}


/* ═══════════════════════════════════════════════════════
   GOOGLE SHEETS — FACULTATIF
   ═══════════════════════════════════════════════════════ */

function logToSheet_(
  memoryId,
  name,
  message,
  type,
  filename,
  mime,
  size,
  duration,
  orientation,
  filter,
  driveId,
  folder
) {
  try {
    const spreadsheet =
      SpreadsheetApp.openById(
        SHEET_ID
      );

    let sheet =
      spreadsheet.getSheetByName(
        SHEET_TAB
      );

    if (!sheet) {
      sheet =
        spreadsheet.insertSheet(
          SHEET_TAB
        );

      const headers = [
        'Memory ID',
        'Date',
        'Prénom',
        'Message',
        'Type',
        'Nom fichier',
        'MIME',
        'Taille (octets)',
        'Durée',
        'Orientation',
        'Filtre',
        'ID Drive',
        'Dossier'
      ];

      sheet.appendRow(headers);

      sheet
        .getRange(
          1,
          1,
          1,
          headers.length
        )
        .setFontWeight('bold')
        .setBackground('#5D262C')
        .setFontColor('#F9F7F2');

      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      memoryId,
      new Date(),
      name,
      message,
      type,
      filename,
      mime,
      size,
      duration,
      orientation,
      filter,
      driveId,
      folder
    ]);

  } catch (error) {
    Logger.log(
      'Erreur Google Sheets : ' +
      String(error)
    );
  }
}


/* ═══════════════════════════════════════════════════════
   RÉPONSE HTTP
   ═══════════════════════════════════════════════════════ */

function buildResponse_(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
