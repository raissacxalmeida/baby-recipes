// Stand-ins for fetch. The code under test (src/client/api.ts, src/server/openai.ts) always sends a plain headers
// object and a JSON string body, or no body on a GET, and reads only ok, status and json() of the answer.

export interface SentInit {
  method: string;
  credentials?: RequestCredentials;
  headers: Record<string, string>;
  body?: string;
}

export interface FakeResponse {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}

export type FakeFetch = (url: string, init: SentInit) => Promise<FakeResponse>;

// Hands a stand-in to code typed against the real fetch. It sends and reads only the fields above, so a stand-in
// answering just those behaves as fetch there; the types of Request and Response are far wider, hence the cast.
export const asFetch = (impl: FakeFetch): typeof fetch => impl as unknown as typeof fetch;
