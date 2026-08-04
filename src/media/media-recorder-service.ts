export class MediaRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  public startRecording(stream: MediaStream, onDataAvailable: (blob: Blob) => void) {
    this.recordedChunks = [];
    
    // Find supported mime type
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    
    let options = {};
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        options = { mimeType: candidate };
        break;
      }
    }

    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const mimeType = this.mediaRecorder?.mimeType || 'video/mp4';
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      onDataAvailable(blob);
    };

    // Request data every 1 second
    this.mediaRecorder.start(1000);
  }

  public stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  public isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

export const mediaRecorderService = new MediaRecorderService();
