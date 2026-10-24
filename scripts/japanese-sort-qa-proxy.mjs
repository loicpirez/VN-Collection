import https from 'node:https';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const upstream = new URL(process.env.QA_UPSTREAM ?? 'http://127.0.0.1:3065');
if (process.env.VNCOLL_QA !== '1' || upstream.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(upstream.hostname)) {
  throw new Error('Use VNCOLL_QA=1 and an isolated loopback QA_UPSTREAM');
}
if (!process.env.QA_TLS_KEY || !process.env.QA_TLS_CERT) throw new Error('Supply a disposable QA_TLS_KEY and QA_TLS_CERT');
const ids = ['v95082', 'v95083', 'v95081'];
const titles = ['Gojuon QA Zulu', 'Gojuon QA Middle', 'Gojuon QA Alpha'];
const items = ids.map((id, index) => ({
  id, added: 100, voted: null, vote: null, started: null, finished: null, notes: null,
  labels: [{ id: 5, label: 'Wishlist' }], in_collection: false, egs: null, title_reading: ['あ', 'い', 'う'][index],
  vn: { id, title: titles[index], alttitle: null, released: null, rating: null, votecount: null, length_minutes: null, languages: ['ja'], platforms: ['win'], image: null, developers: [] },
}));
https.createServer({ key: readFileSync(process.env.QA_TLS_KEY), cert: readFileSync(process.env.QA_TLS_CERT) }, (request, response) => {
  if (request.method === 'GET' && request.url.startsWith('/api/wishlist?')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ items }));
    return;
  }
  const forwarded = http.request({ hostname: upstream.hostname, port: upstream.port, path: request.url, method: request.method, headers: { ...request.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': request.headers.host, 'x-forwarded-for': '127.0.0.1', ...(process.env.TRUSTED_PROXY_SECRET ? { 'x-proxy-secret': process.env.TRUSTED_PROXY_SECRET } : {}) } }, (incoming) => {
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(response);
  });
  forwarded.on('error', () => { response.writeHead(502); response.end(); });
  request.pipe(forwarded);
  response.on('close', () => forwarded.destroy());
}).listen(Number(process.env.QA_PROXY_PORT ?? 3066), '127.0.0.1', () => console.log('Japanese-sort HTTPS QA proxy ready'));
