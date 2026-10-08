import * as appSdk from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js';
import * as authSdk from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import * as firestoreSdk from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import * as databaseSdk from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import * as functionsSdk from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js';
import { connectGoogle, restoreAuth } from './firebase-auth-flow.mjs';
import { createWorldTapAnalytics } from './worldtap-analytics.mjs';
import { createWorldTapAds } from './worldtap-ads.mjs';

export async function initializeWorldTapFirebase() {
  const response = await fetch(new URL('./firebase-config.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error('Firebase configuration could not be loaded.');
  const config = await response.json();
  // This is the approved development build. Production requires a separate,
  // reviewed build configuration; URL/query parameters cannot select a project.
  if (config.projectId !== 'worldtapio-dev') throw new Error('Unexpected Firebase project in development build.');
  const app = appSdk.initializeApp(config);
  const auth = authSdk.getAuth(app);
  await restoreAuth(authSdk, auth);

  window.FirebaseConfig = config;
  window.FirebaseAuthAPI = {
    ...authSdk, auth,
    getPersistenceType: type => [authSdk.indexedDBLocalPersistence,
      authSdk.browserSessionPersistence, authSdk.inMemoryPersistence][type] ?? authSdk.indexedDBLocalPersistence,
  };
  window.FirebaseFirestoreAPI = { ...firestoreSdk, firestore: firestoreSdk.getFirestore(app) };
  window.FirebaseDatabaseAPI = { ...databaseSdk, db: databaseSdk.getDatabase(app) };
  window.FirebaseFunctionsAPI = { ...functionsSdk, functions: functionsSdk.getFunctions(app, 'us-central1') };
  window.WorldTapFirebase = {
    connectGoogle: () => connectGoogle(authSdk, auth),
    // Reuse a restored guest rather than creating a fresh identity on reload.
    ensureGuest: async () => auth.currentUser ?? (await authSdk.signInAnonymously(auth)).user,
  };
  // Inert until enable() is called after the player accepts the Terms; nothing is downloaded or sent before.
  window.WorldTapAnalytics = createWorldTapAnalytics(app, config);
  window.WorldTapAdBlock = window.WorldTapAnalytics.adBlock; // read by AdBlockDetector.cs
  window.WorldTapAds = createWorldTapAds({ document, window }); // in-house ad actions, used by WebAdActions.cs
  return app;
}
