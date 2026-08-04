import { appMachine } from '../../state/app-machine';

export class PreviewScreen {
  private previewImage: HTMLImageElement;
  private previewVideo: HTMLVideoElement;
  private currentObjectUrl: string | null = null;

  constructor() {
    this.previewImage = document.getElementById('preview-image') as HTMLImageElement;
    this.previewVideo = document.getElementById('preview-video') as HTMLVideoElement;

    document.getElementById('btn-preview-keep')?.addEventListener('click', () => {
      appMachine.transitionTo('DETAILS');
    });

    document.getElementById('btn-preview-retry')?.addEventListener('click', () => {
      this.cleanup();
      appMachine.updateContext({ mediaBlob: null });
      // Go back to consent to trigger camera logic again
      appMachine.transitionTo('CONSENT');
    });
  }

  public showPreview(blob: Blob, mediaType: 'photo' | 'video' | null) {
    this.cleanup();
    
    if (!blob || !mediaType) return;
    
    this.currentObjectUrl = URL.createObjectURL(blob);
    
    if (mediaType === 'photo') {
      this.previewVideo.classList.add('hidden');
      this.previewImage.classList.remove('hidden');
      this.previewImage.src = this.currentObjectUrl;
    } else {
      this.previewImage.classList.add('hidden');
      this.previewVideo.classList.remove('hidden');
      this.previewVideo.src = this.currentObjectUrl;
    }
  }

  private cleanup() {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.previewImage.src = '';
    this.previewVideo.src = '';
  }
}
