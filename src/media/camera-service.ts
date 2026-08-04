export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  public async requestPermissions(videoMode: boolean, facingMode: 'user' | 'environment'): Promise<MediaStream> {
    this.stop(); // Ensure any existing stream is stopped

    const constraints = {
      audio: videoMode,
      video: {
        facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.stream;
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      throw error;
    }
  }

  public attachToVideo(videoEl: HTMLVideoElement) {
    if (!this.stream) throw new Error('No active stream');
    this.videoElement = videoEl;
    this.videoElement.srcObject = this.stream;
  }

  public stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }
}

export const cameraService = new CameraService();
