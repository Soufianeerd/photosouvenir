import { AppState, AppContext, initialContext } from './app-state';

type StateChangeListener = (state: AppState, context: AppContext) => void;

class AppMachine {
  private currentState: AppState = 'WELCOME';
  private context: AppContext = { ...initialContext };
  private listeners: StateChangeListener[] = [];

  public getState(): AppState {
    return this.currentState;
  }

  public getContext(): AppContext {
    return this.context;
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public transitionTo(newState: AppState, partialContext?: Partial<AppContext>) {
    // Basic validation could be added here
    this.currentState = newState;
    if (partialContext) {
      this.context = { ...this.context, ...partialContext };
    }
    
    // Notify listeners
    this.listeners.forEach(listener => listener(this.currentState, this.context));
    
    // Manage UI Screens dynamically
    this.updateUIScreens();
  }

  public updateContext(partialContext: Partial<AppContext>) {
    this.context = { ...this.context, ...partialContext };
    this.listeners.forEach(listener => listener(this.currentState, this.context));
  }
  
  public reset() {
    this.context = { ...initialContext };
    this.transitionTo('WELCOME');
  }

  private updateUIScreens() {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(el => {
      el.classList.remove('active');
    });

    // Show the relevant screen based on state
    // Maps states to screen IDs
    const stateToScreenMap: Record<AppState, string> = {
      'WELCOME': 'screen-welcome',
      'MEDIA_CHOICE': 'screen-media-choice',
      'CONSENT': 'screen-consent',
      'REQUESTING_PERMISSIONS': 'screen-camera', // Same screen, just shows prompt
      'CAMERA_READY': 'screen-camera',
      'RECORDING_VIDEO': 'screen-camera',
      'CAPTURED': 'screen-preview',
      'PREVIEW': 'screen-preview',
      'DETAILS': 'screen-details',
      'DELIVERY_CHOICE': 'screen-delivery',
      'PREPARING_MEDIA': 'screen-upload',
      'CREATING_UPLOAD_SESSION': 'screen-upload',
      'UPLOADING': 'screen-upload',
      'UPLOAD_PAUSED': 'screen-upload',
      'PROCESSING_VIDEO': 'screen-upload',
      'SUCCESS': 'screen-success',
      'RECOVERABLE_ERROR': 'screen-error',
      'FATAL_ERROR': 'screen-error'
    };

    const screenId = stateToScreenMap[this.currentState];
    const screenElement = document.getElementById(screenId);
    if (screenElement) {
      screenElement.classList.add('active');
    } else {
      console.warn(`Screen with ID ${screenId} not found in DOM.`);
    }
  }
}

export const appMachine = new AppMachine();
