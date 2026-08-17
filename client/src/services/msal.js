import { PublicClientApplication } from '@azure/msal-browser';

// Default configuration with empty values for local-only development
const msalConfig = {
  auth: {
    // These will be injected at build time if configured, otherwise fall back to empty
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID || 'common'}`,
    redirectUri: window.location.origin + '/auth/callback',
    postLogoutRedirectUri: window.location.origin + '/login'
  },
  cache: {
    cacheLocation: 'sessionStorage', // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
  }
};

// Only instantiate MSAL if a client ID is actually provided (feature flag logic)
export const msalInstance = import.meta.env.VITE_ENTRA_CLIENT_ID 
  ? new PublicClientApplication(msalConfig)
  : null;

// Initialize the instance
if (msalInstance) {
  msalInstance.initialize().then(() => {
    // Optional: handle redirect promise here if needed
    // msalInstance.handleRedirectPromise().then(...);
  }).catch(e => {
    console.error("MSAL Initialization Error:", e);
  });
}

// Scopes for login
export const loginRequest = {
  scopes: ["User.Read", "User.ReadBasic.All"]
};
