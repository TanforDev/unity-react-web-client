// Firebase owns credential storage and account linking. Never copy tokens to
// PlayerPrefs, or merge guest records when Google already owns another account.
export async function resolveGoogleCollision(api, auth, error) {
  if (error.code !== 'auth/credential-already-in-use' &&
      error.code !== 'auth/account-exists-with-different-credential') throw error;
  const credential = api.GoogleAuthProvider.credentialFromError(error);
  if (!credential) throw error;
  return api.signInWithCredential(auth, credential);
}

export function connectGoogle(api, auth) {
  const provider = new api.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  // Start the popup immediately on the click stack; awaiting persistence here
  // can cause mobile browsers to reject it as an unsolicited popup.
  const popup = guest ? api.linkWithPopup(guest, provider) : api.signInWithPopup(auth, provider);
  return popup.catch(error => {
    if (error.code === 'auth/popup-blocked') {
      return guest ? api.linkWithRedirect(guest, provider) : api.signInWithRedirect(auth, provider);
    }
    return resolveGoogleCollision(api, auth, error);
  });
}

export async function restoreAuth(api, auth) {
  await api.setPersistence(auth, api.indexedDBLocalPersistence);
  await auth.authStateReady();
  try {
    await api.getRedirectResult(auth);
  } catch (error) {
    await resolveGoogleCollision(api, auth, error);
  }
  return auth.currentUser;
}
