export type AppState =
  | 'WELCOME'
  | 'MEDIA_CHOICE'
  | 'CONSENT'
  | 'REQUESTING_PERMISSIONS'
  | 'CAMERA_READY'
  | 'RECORDING_VIDEO'
  | 'CAPTURED'
  | 'PREVIEW'
  | 'DETAILS'
  | 'DELIVERY_CHOICE'
  | 'PREPARING_MEDIA'
  | 'CREATING_UPLOAD_SESSION'
  | 'UPLOADING'
  | 'UPLOAD_PAUSED'
  | 'PROCESSING_VIDEO'
  | 'SUCCESS'
  | 'RECOVERABLE_ERROR'
  | 'FATAL_ERROR';

export interface AppContext {
  mediaType: 'photo' | 'video' | null;
  cameraFacingMode: 'user' | 'environment';
  mediaBlob: Blob | null;
  filterId: string;
  guestName: string;
  guestMessage: string;
  destination: 'common' | 'salma' | 'soufiane' | 'both';
  uploadProgress: number;
  errorMessage: string | null;
}

export const initialContext: AppContext = {
  mediaType: null,
  cameraFacingMode: 'environment', // default to back camera
  mediaBlob: null,
  filterId: 'none',
  guestName: '',
  guestMessage: '',
  destination: 'common',
  uploadProgress: 0,
  errorMessage: null,
};
