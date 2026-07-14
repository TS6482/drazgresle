// Minimal, dependency-free client for the GitHub Contents API.
//
// Design notes (see docs/ARCHITECTURE.md §4):
// - Files are JSON blobs, base64-encoded over the wire; we decode/encode with
//   TextEncoder/TextDecoder so multi-byte UTF-8 (Czech diacritics) survives.
// - Writes are compare-and-swap: every PUT sends the file's current blob `sha`.
//   If a spouse saved first GitHub answers 409; we refetch the fresh version,
//   let the caller re-apply its change via a `merge` function, and retry once.
// - Auth/permission failures (401/403) surface as a typed GithubAuthError so the
//   UI can drop into its read-only state instead of failing silently.

const API_BASE = 'https://api.github.com';

export interface JsonFile<T> {
  data: T;
  sha: string;
}

export interface RepoInfo {
  fullName: string;
  canPush: boolean;
}

export interface GithubUser {
  login: string;
}

export interface GithubClientConfig {
  owner: string;
  repo: string;
  token: string;
}

/** Any non-2xx response from the GitHub API. */
export class GithubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

/**
 * A 401/403 response: the token is missing, invalid, expired, or lacks the
 * required permission. 403 can also mean rate limiting, but for this app's usage
 * treating it as an auth problem gives the user the right next step (reconnect).
 */
export class GithubAuthError extends GithubError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = 'GithubAuthError';
  }
}

/** UTF-8-safe base64 encode. */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** UTF-8-safe base64 decode. Tolerates the newlines GitHub adds to `content`. */
export function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

interface ContentsGetResponse {
  content: string;
  sha: string;
  encoding: string;
}

interface ContentsPutResponse {
  content: { sha: string };
}

interface UserResponse {
  login: string;
}

interface RepoResponse {
  full_name: string;
  permissions?: { push?: boolean };
}

function errorFromResponse(res: Response): GithubError {
  const message = `GitHub request failed (${res.status} ${res.statusText}).`;
  if (res.status === 401 || res.status === 403) {
    return new GithubAuthError(res.status, message);
  }
  return new GithubError(res.status, message);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export interface GithubClient {
  getJsonFile<T>(path: string): Promise<JsonFile<T> | null>;
  putJsonFile<T>(
    path: string,
    data: T,
    sha: string | null,
    message: string,
    merge?: (current: T | null) => T,
  ): Promise<JsonFile<T>>;
  getAuthenticatedUser(): Promise<GithubUser>;
  getRepo(): Promise<RepoInfo | null>;
}

export function createGithubClient(config: GithubClientConfig): GithubClient {
  const { owner, repo, token } = config;

  async function request(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers,
      },
    });
  }

  async function getJsonFile<T>(path: string): Promise<JsonFile<T> | null> {
    const res = await request(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
      method: 'GET',
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw errorFromResponse(res);
    }
    const json = (await res.json()) as ContentsGetResponse;
    const text = decodeBase64(json.content);
    return { data: JSON.parse(text) as T, sha: json.sha };
  }

  async function putJsonFile<T>(
    path: string,
    data: T,
    sha: string | null,
    message: string,
    merge?: (current: T | null) => T,
  ): Promise<JsonFile<T>> {
    let payloadData = data;
    let payloadSha = sha;

    // Attempt 0 is the normal write; attempt 1 is the single 409 retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      const body: Record<string, string> = {
        message,
        content: encodeBase64(JSON.stringify(payloadData, null, 2)),
      };
      if (payloadSha !== null) {
        body.sha = payloadSha;
      }

      const res = await request(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const json = (await res.json()) as ContentsPutResponse;
        return { data: payloadData, sha: json.content.sha };
      }

      if (res.status === 409 && attempt === 0) {
        const fresh = await getJsonFile<T>(path);
        payloadSha = fresh ? fresh.sha : null;
        payloadData = merge ? merge(fresh ? fresh.data : null) : payloadData;
        continue;
      }

      throw errorFromResponse(res);
    }

    // Unreachable: the loop always returns on success or throws on failure.
    throw new GithubError(409, 'GitHub write failed after a conflict retry.');
  }

  async function getAuthenticatedUser(): Promise<GithubUser> {
    const res = await request('/user', { method: 'GET' });
    if (!res.ok) {
      throw errorFromResponse(res);
    }
    const json = (await res.json()) as UserResponse;
    return { login: json.login };
  }

  async function getRepo(): Promise<RepoInfo | null> {
    const res = await request(`/repos/${owner}/${repo}`, { method: 'GET' });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw errorFromResponse(res);
    }
    const json = (await res.json()) as RepoResponse;
    return { fullName: json.full_name, canPush: json.permissions?.push ?? false };
  }

  return { getJsonFile, putJsonFile, getAuthenticatedUser, getRepo };
}
