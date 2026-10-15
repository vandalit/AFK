export interface CameraConfig {
  width: number;
  height: number;
  fps: number;
}

export class CameraManager {
  private videoElement: HTMLVideoElement;
  private stream: MediaStream | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  public async start(config: CameraConfig = { width: 1280, height: 720, fps: 60 }): Promise<HTMLVideoElement> {
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: config.width },
        height: { ideal: config.height },
        frameRate: { ideal: config.fps, min: 30 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      await new Promise<void>((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play();
          resolve();
        };
      });
      return this.videoElement;
    } catch (err) {
      console.error('[CameraManager] Error al inicializar la cámara:', err);
      throw err;
    }
  }

  public stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  public isRunning(): boolean {
    return this.stream !== null && this.stream.active;
  }
}
