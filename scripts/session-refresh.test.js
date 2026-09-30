const { test } = require('node:test');
const assert = require('node:assert/strict');

test('concurrent expired bearer requests retry once with the refreshed token', async () => {
  const values = new Map([['token', 'expired']]);
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  } });
  globalThis.window = { location: { pathname: '/', href: '/' } };
  const { default: axios, AxiosError } = await import('../client/node_modules/axios/index.js');
  const { default: api } = await import('../client/src/services/api.js');
  const originalAdapter = axios.defaults.adapter;
  const originalApiAdapter = api.defaults.adapter;
  let refreshes = 0, attempts = 0;
  try {
    axios.defaults.adapter = async config => {
      assert.equal(config.url, '/api/auth/refresh');
      refreshes++;
      await new Promise(resolve => setImmediate(resolve));
      return { data: { token: 'fresh' }, status: 200, headers: {}, config };
    };
    api.defaults.adapter = async config => {
      attempts++;
      if (config.headers.Authorization !== 'Bearer fresh' || config.url === '/auth/login') {
        throw new AxiosError('Expired', 'ERR_BAD_REQUEST', config, null, { status: 401, data: {}, config });
      }
      return { data: { ok: true }, status: 200, headers: {}, config };
    };
    const responses = await Promise.all([api.get('/projects/options'), api.get('/timesheets')]);
    assert(responses.every(response => response.data.ok));
    assert.equal(refreshes, 1); assert.equal(attempts, 4);
    await assert.rejects(api.post('/auth/login', { email: 'bad', password: 'bad' }));
    assert.equal(refreshes, 1, 'bad credentials must not start a refresh');
  } finally {
    axios.defaults.adapter = originalAdapter; api.defaults.adapter = originalApiAdapter;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
