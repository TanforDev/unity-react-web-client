import { useState } from 'react';
import UnityPlayer from './UnityPlayer.jsx';
import { getUnityConfig } from './runtime.js';
export default function App() {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  return (<>
    <UnityPlayer config={getUnityConfig()} onProgress={setProgress}
      onReady={() => setReady(true)} onError={setError} />
    {!ready && <div className="loading" role="status" aria-live="polite">
      {error ? <>
        <p>WorldTap could not load. Please try again.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </> : <>
        <p>Loading WorldTap… {Math.round(progress * 100)}%</p>
        <progress max="1" value={progress} aria-label="Game download progress" />
      </>}
    </div>}
  </>);
}
