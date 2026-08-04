import './style.css';
import { appMachine } from './state/app-machine';
import { CameraScreen } from './ui/screens/camera-screen';
import { PreviewScreen } from './ui/screens/preview-screen';

// Basic Initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('App initialized.');
  const cameraScreen = new CameraScreen();
  const previewScreen = new PreviewScreen();

  appMachine.subscribe((state, context) => {
    if (state === 'REQUESTING_PERMISSIONS') {
      cameraScreen.startCamera(context.mediaType === 'video', context.cameraFacingMode);
    } else if (state === 'CAPTURED') {
      if (context.mediaBlob) {
        previewScreen.showPreview(context.mediaBlob, context.mediaType);
      }
    }
  });

  appMachine.transitionTo('WELCOME');

  // Welcome Screen Handlers
  document.getElementById('btn-start')?.addEventListener('click', () => {
    appMachine.transitionTo('MEDIA_CHOICE');
  });

  // Media Choice Handlers
  document.getElementById('btn-choice-photo')?.addEventListener('click', () => {
    appMachine.updateContext({ mediaType: 'photo' });
    appMachine.transitionTo('CONSENT');
  });
  
  document.getElementById('btn-choice-video')?.addEventListener('click', () => {
    appMachine.updateContext({ mediaType: 'video' });
    appMachine.transitionTo('CONSENT');
  });

  document.getElementById('btn-import-media')?.addEventListener('click', () => {
    document.getElementById('input-import-media')?.click();
  });

  document.getElementById('input-import-media')?.addEventListener('change', (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      appMachine.updateContext({ mediaType: 'photo' });
      
      // Conversion de l'image (HEIC/PNG etc) en JPEG via Canvas
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              appMachine.updateContext({ mediaBlob: blob, filterId: 'none' });
              appMachine.transitionTo('PREVIEW');
            }
          }, 'image/jpeg', 0.9);
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        appMachine.updateContext({ errorMessage: 'Format image non supporté.' });
        appMachine.transitionTo('RECOVERABLE_ERROR');
      };
      img.src = url;
    }
  });

  document.getElementById('btn-back-welcome')?.addEventListener('click', () => {
    appMachine.transitionTo('WELCOME');
  });

  // Consent Handlers
  document.getElementById('btn-consent-accept')?.addEventListener('click', () => {
    appMachine.transitionTo('REQUESTING_PERMISSIONS');
  });

  document.getElementById('btn-consent-decline')?.addEventListener('click', () => {
    appMachine.transitionTo('MEDIA_CHOICE');
  });

  // Details Screen Handlers
  document.getElementById('btn-details-back')?.addEventListener('click', () => {
    appMachine.transitionTo('PREVIEW');
  });

  document.getElementById('btn-details-next')?.addEventListener('click', () => {
    const nameEl = document.getElementById('guest-name') as HTMLInputElement;
    const msgEl = document.getElementById('guest-message') as HTMLTextAreaElement;
    appMachine.updateContext({
      guestName: nameEl.value,
      guestMessage: msgEl.value
    });
    appMachine.transitionTo('DELIVERY_CHOICE');
  });

  // Delivery Choice Handlers
  document.getElementById('btn-delivery-back')?.addEventListener('click', () => {
    appMachine.transitionTo('DETAILS');
  });

  document.getElementById('btn-delivery-share')?.addEventListener('click', async () => {
    // Local share only
    appMachine.updateContext({ destination: 'common' });
    await shareMedia();
  });

  document.getElementById('btn-delivery-send')?.addEventListener('click', () => {
    // Upload only
    appMachine.updateContext({ destination: 'common' });
    appMachine.transitionTo('CREATING_UPLOAD_SESSION');
    startUpload();
  });

  document.getElementById('btn-delivery-both')?.addEventListener('click', async () => {
    // Both
    appMachine.updateContext({ destination: 'common' });
    await shareMedia();
    appMachine.transitionTo('CREATING_UPLOAD_SESSION');
    startUpload();
  });

  // End screens
  document.getElementById('btn-new-memory')?.addEventListener('click', () => {
    appMachine.reset();
  });
  document.getElementById('btn-error-home')?.addEventListener('click', () => {
    appMachine.reset();
  });
  document.getElementById('btn-error-retry')?.addEventListener('click', () => {
    appMachine.transitionTo('DELIVERY_CHOICE');
  });

  // Global Error Handler
  window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    appMachine.updateContext({ errorMessage: e.message });
    appMachine.transitionTo('RECOVERABLE_ERROR');
  });
});

async function shareMedia() {
  const ctx = appMachine.getContext();
  if (!ctx.mediaBlob) return;

  const ext = ctx.mediaType === 'photo' ? 'jpg' : 'mp4';
  const mime = ctx.mediaType === 'photo' ? 'image/jpeg' : 'video/mp4';
  const filename = `salma-soufiane-souvenir-${Date.now()}.${ext}`;

  const file = new File([ctx.mediaBlob], filename, { type: mime });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'Souvenir Mariage Salma & Soufiane',
        text: 'Voici notre souvenir !',
        files: [file]
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Share failed', e);
        fallbackDownload(ctx.mediaBlob, filename);
      }
    }
  } else {
    fallbackDownload(ctx.mediaBlob, filename);
  }
}

function fallbackDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Configuration des limites
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 Mo (qui deviendront ~33 Mo en base64)

async function startUpload() {
  const ctx = appMachine.getContext();
  if (!ctx.mediaBlob) {
    appMachine.updateContext({ errorMessage: 'Aucun média à envoyer.' });
    appMachine.transitionTo('RECOVERABLE_ERROR');
    return;
  }

  // Vérification de la taille pour la vidéo
  if (ctx.mediaType === 'video' && ctx.mediaBlob.size > MAX_VIDEO_BYTES) {
    appMachine.updateContext({ errorMessage: 'Vidéo trop volumineuse (> 25 Mo). Enregistrez-la sur votre téléphone.' });
    appMachine.transitionTo('RECOVERABLE_ERROR');
    return;
  }

  appMachine.transitionTo('UPLOADING');
  
  const statusText = document.getElementById('upload-status-text') as HTMLElement;
  statusText.textContent = 'Préparation du fichier...';

  try {
    const mediaBase64 = await blobToBase64(ctx.mediaBlob);
    
    // Le filtre vidéo n'est pas incrusté côté client (hors canvas pour photo). 
    // S'il s'agit d'une vidéo, on prévient si un filtre était sélectionné.
    if (ctx.mediaType === 'video' && ctx.filterId !== 'none') {
      console.warn("Filtre vidéo désactivé : Le navigateur ne permet pas l'incrustation directe.");
    }
    
    const ext = ctx.mediaType === 'photo' ? 'jpg' : 'mp4';
    const mime = ctx.mediaType === 'photo' ? 'image/jpeg' : 'video/mp4'; // PhotoCompositor exporte en image/jpeg
    const filename = `salma-soufiane-${ctx.mediaType}-${Date.now()}.${ext}`;
    const uploadId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

    const payload = {
      uploadId: uploadId,
      mediaBase64: mediaBase64.split(',')[1], // Garde uniquement la data
      mimeType: mime,
      mediaType: ctx.mediaType,
      filename: filename,
      guestName: ctx.guestName,
      message: ctx.guestMessage,
      filterId: ctx.filterId,
      orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape',
      duration: 0, // Inconnu exactement depuis frontend, 60s max
    };

    const scriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL;
    if (!scriptUrl) throw new Error("VITE_APPS_SCRIPT_URL non défini.");

    statusText.textContent = 'Envoi vers Google Drive (veuillez patienter)...';

    // 1. Envoi POST en no-cors
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload)
    });

    // 2. Polling du statut (JSONP)
    statusText.textContent = 'Vérification de la réception...';
    pollStatus(scriptUrl, uploadId);

  } catch (err: any) {
    appMachine.updateContext({ errorMessage: 'Erreur lors de la préparation : ' + err.message });
    appMachine.transitionTo('RECOVERABLE_ERROR');
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function pollStatus(scriptUrl: string, uploadId: string) {
  let attempts = 0;
  const maxAttempts = 30; // 30 tentatives * 2s = 60s max
  const callbackName = 'jsonpCallback_' + uploadId.replace(/-/g, '_');

  const cleanup = () => {
    delete (window as any)[callbackName];
    const scriptTag = document.getElementById(callbackName);
    if (scriptTag) scriptTag.remove();
  };

  const interval = setInterval(() => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(interval);
      cleanup();
      appMachine.updateContext({ errorMessage: 'Nous ne pouvons pas confirmer l’envoi. Votre souvenir est toujours disponible sur cet appareil. Vous pouvez réessayer.' });
      appMachine.transitionTo('RECOVERABLE_ERROR');
      return;
    }

    // Création de la fonction callback global
    (window as any)[callbackName] = (response: any) => {
      clearInterval(interval);
      cleanup();
      
      if (response.status === 'COMPLETED') {
        appMachine.transitionTo('SUCCESS');
      } else if (response.status === 'FAILED') {
        appMachine.updateContext({ errorMessage: response.error || 'Erreur inconnue.' });
        appMachine.transitionTo('RECOVERABLE_ERROR');
      } else {
        // RECEIVED ou PROCESSING, on attend
        // (on relancera le polling au prochain interval)
        const statusText = document.getElementById('upload-status-text') as HTMLElement;
        statusText.textContent = 'Traitement en cours chez Google...';
        
        // Il faut nettoyer la balise script de cette tentative pour pouvoir en refaire une
        const scriptTag = document.getElementById(callbackName);
        if (scriptTag) scriptTag.remove();
        
        // Recréer l'intervalle
        pollStatus(scriptUrl, uploadId);
      }
    };

    // Injection du script JSONP
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `${scriptUrl}?action=status&uploadId=${uploadId}&prefix=${callbackName}&t=${Date.now()}`;
    document.body.appendChild(script);

  }, 2000);
}

