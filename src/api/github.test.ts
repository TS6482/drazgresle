import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GithubAuthError,
  createGithubClient,
  decodeBase64,
  encodeBase64,
} from './github';

// Build a minimal Response-shaped object. We only touch the fields the client reads.
function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
  } as unknown as Response;
}

interface PutBody {
  message: string;
  content: string;
  sha?: string;
}

function readPutBody(init: RequestInit | undefined): PutBody {
  return JSON.parse(String(init?.body)) as PutBody;
}

const config = { owner: 'alice', repo: 'drazgresle-data', token: 'test-token' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('github contents client', () => {
  it('reads and decodes an existing JSON file', async () => {
    const content = encodeBase64(JSON.stringify({ name: 'Dražgrešle', total: 12345 }));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { content, sha: 'sha-1', encoding: 'base64' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createGithubClient(config);
    const result = await client.getJsonFile<{ name: string; total: number }>('data/settings.json');

    expect(result).toEqual({ data: { name: 'Dražgrešle', total: 12345 }, sha: 'sha-1' });

    // Auth header and URL are wired up correctly.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/alice/drazgresle-data/contents/data/settings.json');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('returns null when the file does not exist (404)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(404, { message: 'Not Found' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createGithubClient(config);
    const result = await client.getJsonFile('data/missing.json');

    expect(result).toBeNull();
  });

  it('writes a JSON file and returns the new sha', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { content: { sha: 'sha-new' } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createGithubClient(config);
    const result = await client.putJsonFile('data/x.json', { a: 1 }, 'sha-old', 'update x');

    expect(result.sha).toBe('sha-new');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    const body = readPutBody(init);
    expect(body.message).toBe('update x');
    expect(body.sha).toBe('sha-old');
    expect(JSON.parse(decodeBase64(body.content))).toEqual({ a: 1 });
  });

  it('retries once on 409, refetching sha and re-applying the caller merge', async () => {
    const freshContent = encodeBase64(JSON.stringify({ items: ['server'] }));
    const fetchMock = vi
      .fn()
      // 1) first PUT conflicts
      .mockResolvedValueOnce(makeResponse(409, { message: 'Conflict' }))
      // 2) refetch returns the spouse's newer version
      .mockResolvedValueOnce(makeResponse(200, { content: freshContent, sha: 'sha-fresh', encoding: 'base64' }))
      // 3) retried PUT succeeds
      .mockResolvedValueOnce(makeResponse(200, { content: { sha: 'sha-final' } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createGithubClient(config);
    const merge = (current: { items: string[] } | null) => ({
      items: [...(current?.items ?? []), 'local'],
    });

    const result = await client.putJsonFile(
      'data/list.json',
      { items: ['local'] },
      'sha-old',
      'append local',
      merge,
    );

    expect(result.sha).toBe('sha-final');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The retried PUT carries the refetched sha and the merged data.
    const [, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    const retryBody = readPutBody(retryInit);
    expect(retryBody.sha).toBe('sha-fresh');
    expect(JSON.parse(decodeBase64(retryBody.content))).toEqual({ items: ['server', 'local'] });
  });

  it('surfaces a typed GithubAuthError on an invalid token (401)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, { message: 'Bad credentials' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createGithubClient(config);

    await expect(client.getJsonFile('data/settings.json')).rejects.toBeInstanceOf(GithubAuthError);
  });
});
