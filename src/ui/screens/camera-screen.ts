import { appMachine } from '../../state/app-machine';
import { cameraService } from '../../media/camera-service';
import { mediaRecorderService } from '../../media/media-recorder-service';
import { photoCompositor } from '../../media/photo-compositor';

export class CameraScreen {
  private videoEl: HTMLVideoElement;
  private overlayEl: HTMLImageElement;
  private filterContainer: HTMLElement;
  private captureBtn: HTMLElement;
  private flipBtn: HTMLElement;
  private timerEl: HTMLElement;
  
  private filters: any[] = [];
  private currentFilterId: string = 'none';
  private timerInterval: any = null;

  constructor() {
    this.videoEl = document.getElementById('camera-video') as HTMLVideoElement;
    this.overlayEl = document.getElementById('camera-overlay') as HTMLImageElement;
    this.filterContainer = document.getElementById('filter-carousel-container') as HTMLElement;
    this.captureBtn = document.getElementById('btn-capture') as HTMLElement;
    this.flipBtn = document.getElementById('btn-flip-camera') as HTMLElement;
    this.timerEl = document.getElementById('recording-timer') as HTMLElement;

    this.initListeners();
    this.loadFilters();
  }

  private async loadFilters() {
    try {
      const res = await fetch('/filters/filters.json');
      const data = await res.json();
      this.filters = data.filters;
      this.renderFilters();
    } catch (e) {
      console.error('Failed to load filters', e);
    }
  }

  private renderFilters() {
    this.filterContainer.innerHTML = '';
    this.filters.forEach((filter) => {
      const el = document.createElement('div');
      el.className = 'filter-item';
      el.dataset.id = filter.id;
      el.setAttribute('aria-selected', filter.id === this.currentFilterId ? 'true' : 'false');
      
      const thumbUrl = filter.id === 'none' 
        ? '' 
        : `/filters/portrait/${filter.id}.png`; // normally we'd have thumbnails, fallback to original for now
        
      el.innerHTML = `
        <img class="filter-thumbnail" src="${thumbUrl}" alt="" />
        <span class="filter-name">${filter.name}</span>
      `;
      
      el.addEventListener('click', () => {
        this.currentFilterId = filter.id;
        this.updateFilterSelection();
      });
      
      this.filterContainer.appendChild(el);
    });
  }

  private updateFilterSelection() {
    Array.from(this.filterContainer.children).forEach((el: any) => {
      el.setAttribute('aria-selected', el.dataset.id === this.currentFilterId ? 'true' : 'false');
    });

    const filterUrl = this.currentFilterId === 'none' 
      ? '' 
      : `/filters/portrait/${this.currentFilterId}.png`;
      
    this.overlayEl.src = filterUrl;
    appMachine.updateContext({ filterId: this.currentFilterId });
  }

  private initListeners() {
    this.flipBtn.addEventListener('click', async () => {
      const ctx = appMachine.getContext();
      const newMode = ctx.cameraFacingMode === 'user' ? 'environment' : 'user';
      appMachine.updateContext({ cameraFacingMode: newMode });
      await this.startCamera(ctx.mediaType === 'video', newMode);
    });

    this.captureBtn.addEventListener('click', async () => {
      const ctx = appMachine.getContext();
      
      if (ctx.mediaType === 'photo') {
        this.takePhoto();
      } else {
        this.toggleVideoRecording();
      }
    });

    document.getElementById('btn-cancel-camera')?.addEventListener('click', () => {
      cameraService.stop();
      mediaRecorderService.stopRecording();
      appMachine.transitionTo('MEDIA_CHOICE');
    });
  }

  public async startCamera(isVideo: boolean, facingMode: 'user' | 'environment') {
    try {
      await cameraService.requestPermissions(isVideo, facingMode);
      cameraService.attachToVideo(this.videoEl);
      
      // Mirror video if selfie
      if (facingMode === 'user') {
        this.videoEl.classList.add('mirrored');
      } else {
        this.videoEl.classList.remove('mirrored');
      }
      
      this.timerEl.classList.add('hidden');
      this.captureBtn.classList.remove('recording');
      appMachine.transitionTo('CAMERA_READY');
    } catch (e: any) {
      console.error(e);
      appMachine.updateContext({ errorMessage: 'Impossible d\'accéder à la caméra: ' + e.message });
      appMachine.transitionTo('RECOVERABLE_ERROR');
    }
  }

  private async takePhoto() {
    const ctx = appMachine.getContext();
    const isMirrored = ctx.cameraFacingMode === 'user';
    const filterUrl = this.currentFilterId === 'none' ? null : `/filters/portrait/${this.currentFilterId}.png`;
    
    try {
      const blob = await photoCompositor.composite(this.videoEl, filterUrl, isMirrored);
      cameraService.stop();
      appMachine.transitionTo('CAPTURED', { mediaBlob: blob });
    } catch (e: any) {
      console.error(e);
      appMachine.updateContext({ errorMessage: 'Erreur lors de la capture: ' + e.message });
      appMachine.transitionTo('RECOVERABLE_ERROR');
    }
  }

  private toggleVideoRecording() {
    if (mediaRecorderService.isRecording()) {
      mediaRecorderService.stopRecording();
      this.stopTimer();
      this.captureBtn.classList.remove('recording');
      this.timerEl.classList.add('hidden');
    } else {
      const stream = cameraService.getStream();
      if (!stream) return;
      
      appMachine.transitionTo('RECORDING_VIDEO');
      this.captureBtn.classList.add('recording');
      this.timerEl.classList.remove('hidden');
      
      this.startTimer();
      mediaRecorderService.startRecording(stream, (blob) => {
        cameraService.stop();
        appMachine.transitionTo('CAPTURED', { mediaBlob: blob });
      });
    }
  }

  private startTimer() {
    let seconds = 0;
    this.updateTimerUI(seconds);
    
    this.timerInterval = setInterval(() => {
      seconds++;
      this.updateTimerUI(seconds);
      
      if (seconds >= 60) {
        // Strict 60 second limit
        this.toggleVideoRecording();
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private updateTimerUI(seconds: number) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    this.timerEl.textContent = `${mins}:${secs}`;
    
    // Warning near the end
    if (seconds >= 50) {
      this.timerEl.style.color = 'var(--color-error)';
    } else {
      this.timerEl.style.color = 'var(--color-white)';
    }
  }
}
