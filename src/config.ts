// Static configuration. The orchestrator fills in DATA_REPO_OWNER once the private
// data repository exists (replace OWNER_PLACEHOLDER with the GitHub account/org that
// owns it). Nothing secret lives here — the access token is entered by the user at
// runtime and kept only in sessionStorage.

export const DATA_REPO_OWNER = 'TS6482';
export const DATA_REPO_NAME = 'drazgresle-data';

// Key under which the access token is cached for the lifetime of the browser tab.
export const TOKEN_STORAGE_KEY = 'drazgresle.token';
