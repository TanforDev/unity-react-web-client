/* eslint-disable react/prop-types -- internal component with a fixed caller */
import { useEffect, useRef } from 'react';
import { attachUnityInstance } from './runtime.js';
import { renderScale } from './unity-config.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error('Could not load the Unity loader'));
    document.body.appendChild(script);
  });
}

// One Unity instance per mount. Handles unmount while creation is still pending and
// quits the resolved instance on cleanup. Accepts the config from getUnityConfig().
export default function UnityPlayer({ config, onProgress, onReady, onError }) {
  const canvasRef = useRef(null);
  const instanceRef = useRef(null);

  // Keep Unity's backing-store scale in step with the browser's pixel ratio.
  useEffect(() => {
    const apply = () => {
      const module = instanceRef.current?.Module;
      if (module) module.devicePixelRatio = renderScale(window.devicePixelRatio);
    };
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    let cancelled = false;
    let instance = null;
    let script = null;
    (async () => {
      try {
        const { loaderUrl, ...unityConfig } = config;
        script = await loadScript(loaderUrl);
        const created = await window.createUnityInstance(canvas, { ...unityConfig, devicePixelRatio: renderScale(window.devicePixelRatio) }, p => { if (!cancelled) onProgress?.(p); });
        if (cancelled) { await created.Quit(); return; }
        instance = created;
        instanceRef.current = created;
        attachUnityInstance(instance);
        onReady?.(instance);
      } catch (error) {
        if (!cancelled) onError?.(error);
      }
    })();
    return () => {
      cancelled = true;
      script?.remove();
      instanceRef.current = null;
      if (instance) instance.Quit().catch(() => {});
    };
    // The config is fixed for the page lifetime; callbacks are intentionally read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Unity's framework resolves its canvas with document.querySelector('#' + canvas.id).
  return <canvas ref={canvasRef} id="unity-canvas" className="content" tabIndex={0} aria-label="WorldTap game" />;
}
