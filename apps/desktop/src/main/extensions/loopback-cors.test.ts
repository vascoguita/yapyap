import { describe, expect, it } from 'vitest';
import { loopbackCors } from './loopback-cors.ts';

const ORIGIN = 'extension://org.example.local';

function setup(local: boolean) {
  return loopbackCors({
    id: 'org.example.local',
    local: () => local,
    present: (headers) => ({ ...headers, 'sec-ch-ua': 'presented' }),
  });
}

describe('loopbackCors', () => {
  it('sends loopback requests without an Origin, whatever its case, and keeps the presented headers', () => {
    const cors = setup(true);
    for (const url of ['http://localhost:11435/v1', 'http://127.0.0.1:1/', 'http://[::1]:2/']) {
      expect(
        cors.beforeSendHeaders({
          url,
          requestHeaders: { Origin: ORIGIN, origin: ORIGIN, Accept: '*/*' },
        }),
      ).toEqual({ Accept: '*/*', 'sec-ch-ua': 'presented' });
    }
  });

  it('answers CORS for the extension on loopback, replacing what the server said', () => {
    const cors = setup(true);
    const expected = {
      'Content-Type': ['application/json'],
      'Access-Control-Allow-Origin': [ORIGIN],
      'Access-Control-Allow-Headers': ['*, Authorization'],
      'Access-Control-Allow-Methods': ['*'],
    };
    const responseHeaders = {
      'Content-Type': ['application/json'],
      'access-control-allow-origin': ['http://127.0.0.1:11435'],
      'Access-Control-Allow-Credentials': ['true'],
    };
    expect(
      cors.headersReceived({ url: 'http://localhost:11435/v1', method: 'POST', responseHeaders }),
    ).toEqual({ responseHeaders: expected });
    expect(cors.headersReceived({ url: 'http://localhost:11435/v1', method: 'OPTIONS' })).toEqual({
      responseHeaders: {
        'Access-Control-Allow-Origin': [ORIGIN],
        'Access-Control-Allow-Headers': ['*, Authorization'],
        'Access-Control-Allow-Methods': ['*'],
      },
      statusLine: 'HTTP/1.1 204 No Content',
    });
  });

  it('leaves other hosts, and extensions without local-network, alone', () => {
    const headers = { Origin: ORIGIN };
    const granted = setup(true);
    expect(
      granted.beforeSendHeaders({ url: 'https://api.example.org/', requestHeaders: headers }),
    ).toEqual({ Origin: ORIGIN, 'sec-ch-ua': 'presented' });
    expect(
      granted.headersReceived({ url: 'http://192.168.1.10:11434/', method: 'OPTIONS' }),
    ).toEqual({});
    const refused = setup(false);
    expect(
      refused.beforeSendHeaders({ url: 'http://localhost:11435/', requestHeaders: headers }),
    ).toEqual({ Origin: ORIGIN, 'sec-ch-ua': 'presented' });
    expect(refused.headersReceived({ url: 'http://localhost:11435/', method: 'POST' })).toEqual({});
  });
});
