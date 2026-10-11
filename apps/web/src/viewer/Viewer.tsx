import { useEffect, useRef, useState } from 'react';
import type { Highlight, IfcScene, ModelInput, PickedElement } from './scene.ts';

interface ViewerProps {
  models: readonly ModelInput[];
  highlight: Highlight | null;
}

export function Viewer({ models, highlight }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<IfcScene | null>(null);
  const [picked, setPicked] = useState<PickedElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // three.js and web-ifc are large; load them only when the viewer mounts.
  useEffect(() => {
    let disposed = false;
    import('./scene.ts')
      .then(({ IfcScene: Scene }) => {
        if (disposed) return;
        const scene = new Scene(containerRef.current!);
        scene.onPick(setPicked);
        sceneRef.current = scene;
        setReady(true);
      })
      .catch((error: unknown) => setStatus(`Görüntüleyici yüklenemedi: ${(error as Error).message}`));
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready) return;
    let cancelled = false;
    setStatus(models.length ? 'Modeller yükleniyor…' : null);
    scene
      .setModels(models)
      .then(() => {
        if (!cancelled) {
          setStatus(null);
          scene.highlight(highlight);
        }
      })
      .catch((error: unknown) => !cancelled && setStatus(`Model görüntülenemedi: ${(error as Error).message}`));
    return () => {
      cancelled = true;
    };
    // Reload only when the models change; highlight changes are handled by the next effect.
  }, [models, ready]);

  useEffect(() => {
    if (ready) sceneRef.current?.highlight(highlight);
  }, [highlight, ready]);

  return (
    <div className="viewer">
      <div className="viewer-canvas" ref={containerRef} />
      {status && <div className="viewer-status">{status}</div>}
      {highlight && (
        <div className="viewer-legend">
          <span className="swatch subject" /> konu <span className="swatch object" /> nesne <span className="swatch mitigation" /> en yakın koruyucu
        </div>
      )}
      {picked && (
        <div className="viewer-pick">
          <strong>{picked.ifcClass}</strong> {picked.name ?? ''}
          <code>{picked.globalId}</code>
        </div>
      )}
    </div>
  );
}
