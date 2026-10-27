export interface ReactGrabCapturePlugin {
  captureWithSnapdom: (devicePixelRatio: number) => Promise<HTMLCanvasElement | null>;
  captureWithHtmlToImage: (
    devicePixelRatio: number,
    cssWidth: number,
    cssHeight: number,
  ) => Promise<HTMLCanvasElement | null>;
}

declare global {
  var __REACT_GRAB_CAPTURE__: ReactGrabCapturePlugin | undefined;
  var __REACT_GRAB_CAPTURE_SRC__: string | undefined;
}
