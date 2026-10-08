import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { initializeRuntime } from './runtime.js';
const root = createRoot(document.getElementById('root'));
root.render(<div className="loading" role="status">Preparing WorldTap…</div>);
// Unity owns a persistent native runtime; avoid mounting it twice in StrictMode.
initializeRuntime().then(() => root.render(<App />)).catch(error => {
  console.error('WorldTap initialization failed', error);
  root.render(<div className="loading" role="alert">
    <p>WorldTap could not load. Please check your connection and try again.</p>
    <button onClick={() => window.location.reload()}>Reload</button>
  </div>);
});
