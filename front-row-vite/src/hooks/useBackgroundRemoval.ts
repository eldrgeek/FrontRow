import { useEffect, useRef, useState } from 'react';

/**
 * useBackgroundRemoval
 *
 * Takes a raw MediaStream and returns a composited MediaStream with the
 * background removed via MediaPipe SelfieSegmentation. Falls back silently
 * to the original stream if MediaPipe fails to load or process.
 */
export function useBackgroundRemoval(
  rawStream: MediaStream | null,
  enabled: boolean
): MediaStream | null {
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const segRef = useRef<unknown>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!rawStream || !enabled) {
      setOutputStream(rawStream);
      return;
    }

    let cancelled = false;
    activeRef.current = true;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvasRef.current = canvas;

    const video = document.createElement('video');
    video.srcObject = rawStream;
    video.playsInline = true;
    video.muted = true;
    videoRef.current = video;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setOutputStream(rawStream);
      return;
    }

    // Attempt to load MediaPipe
    (async () => {
      try {
        // Dynamic import — MediaPipe selfie segmentation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation' as any);

        if (cancelled) return;

        const seg = new SelfieSegmentation({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`,
        });

        seg.setOptions({ modelSelection: 1, selfieMode: true });

        seg.onResults((results: { segmentationMask: CanvasImageSource; image: CanvasImageSource }) => {
          if (cancelled) return;
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Draw mask — keep only person pixels
          ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = 'source-in';
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        });

        await seg.initialize();
        if (cancelled) return;
        segRef.current = seg;

        await video.play();
        if (cancelled) return;

        // Adapt canvas to actual video dimensions
        video.addEventListener('loadedmetadata', () => {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        });

        // Frame loop
        const sendFrame = async () => {
          if (cancelled || !activeRef.current) return;
          if (video.readyState >= 2) {
            await seg.send({ image: video });
          }
          rafRef.current = requestAnimationFrame(sendFrame);
        };
        rafRef.current = requestAnimationFrame(sendFrame);

        // Capture composited canvas as a stream
        const composited = canvas.captureStream(30);
        // Carry audio tracks from original stream
        rawStream.getAudioTracks().forEach(t => composited.addTrack(t));

        if (!cancelled) setOutputStream(composited);

      } catch (err) {
        console.warn('[useBackgroundRemoval] MediaPipe load failed, falling back:', err);
        // Silent fallback — return raw stream unchanged
        if (!cancelled) setOutputStream(rawStream);
      }
    })();

    return () => {
      cancelled = true;
      activeRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      video.srcObject = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (segRef.current as any)?.close?.();
      segRef.current = null;
    };
  }, [rawStream, enabled]);

  return outputStream;
}
