import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicIcons = readFileSync('ops/nginx/vndb-public-icons.conf', 'utf8');
const proxyProof = readFileSync('ops/nginx/vndb-trusted-proxy.conf.example', 'utf8');
const backupRestore = readFileSync('ops/nginx/vndb-backup-restore.conf', 'utf8');
const browserSessionMap = readFileSync('ops/nginx/vndb-browser-session-map.conf.example', 'utf8');
const basicAuth = readFileSync('ops/nginx/vndb-basic-auth.conf', 'utf8');
const browserSessionCookie = readFileSync('ops/nginx/vndb-browser-session-cookie.conf', 'utf8');

describe('Nginx Basic Auth public icon contract', () => {
  it('exempts only browser icon discovery routes from Basic Auth', () => {
    expect(publicIcons).toContain('auth_basic off;');
    expect(publicIcons).toContain('return 204;');
    expect(publicIcons).toContain('favicon\\.ico');
    expect(publicIcons).toContain('apple-touch-icon');
    expect(publicIcons).not.toMatch(/location\s+\/?\s*\{/);
    expect(publicIcons).not.toContain('/api');
    expect(publicIcons).not.toContain('/_next');
    expect(publicIcons.match(/auth_basic off;/g)).toHaveLength(1);
  });

  it('documents the iOS credential-context reason and authenticated fallback', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('NetworkingExtension');
    expect(readme).toContain('include /etc/nginx/snippets/vndb-public-icons.conf;');
    expect(readme).toMatch(/All pages, Next\.js assets,\s+and API routes remain behind Basic Auth/);
    expect(readme).toContain('Nginx must');
    expect(readme).toContain('overwrite `X-Proxy-Secret`');
  });

  it('ships a secret-free trusted-proxy template with the public host contract', () => {
    expect(proxyProof).toContain('proxy_set_header X-Forwarded-Host $host;');
    expect(proxyProof).toContain('proxy_set_header X-Proxy-Secret');
    expect(proxyProof).toContain('REPLACE_WITH_TRUSTED_PROXY_SECRET');
    expect(proxyProof).not.toMatch(/[a-f0-9]{64}/i);
  });

  it('raises the upload cap only for authenticated streaming restores', () => {
    expect(backupRestore).toContain('location = /api/backup/restore {');
    expect(backupRestore).toContain('include /etc/nginx/snippets/vndb-basic-auth.conf;');
    expect(backupRestore).toContain('include /etc/nginx/snippets/vndb-proxy-proof.conf;');
    expect(backupRestore).toContain('client_max_body_size 4G;');
    expect(backupRestore).toContain('proxy_request_buffering off;');
    expect(backupRestore).toContain('proxy_read_timeout 300s;');
    expect(backupRestore).not.toContain('auth_basic off;');
    expect(backupRestore.match(/location\s*=/g)).toHaveLength(1);
  });

  it('documents both production Nginx includes', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('include /etc/nginx/snippets/vndb-public-icons.conf;');
    expect(readme).toContain('include /etc/nginx/snippets/vndb-backup-restore.conf;');
  });

  it('bridges one successful Basic Auth response into a bounded browser session', () => {
    expect(browserSessionMap).toContain('map_hash_bucket_size 128;');
    expect(browserSessionMap).toContain('map $cookie_vndb_auth_session $vndb_auth_realm {');
    expect(browserSessionMap).toContain('default "VNDB private";');
    expect(browserSessionMap).toContain('"REPLACE_WITH_64_HEX_SESSION_TOKEN" off;');
    expect(browserSessionMap).toContain('map $http_authorization $vndb_session_cookie {');
    expect(browserSessionMap).toContain('~*^Basic\\s+');
    expect(browserSessionMap).toContain('Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Strict');
    expect(browserSessionMap.match(/REPLACE_WITH_64_HEX_SESSION_TOKEN/g)).toHaveLength(2);
    expect(browserSessionMap).not.toMatch(/[a-f0-9]{64}/i);
  });

  it('keeps the Basic Auth challenge active unless the exact session token matches', () => {
    expect(basicAuth).toBe([
      'auth_basic $vndb_auth_realm;',
      'auth_basic_user_file /etc/nginx/.htpasswd;',
      '',
    ].join('\n'));
    expect(basicAuth).not.toContain('auth_basic off;');
  });

  it('sets the session cookie only on successful inherited response statuses', () => {
    expect(browserSessionCookie).toBe('add_header Set-Cookie $vndb_session_cookie;\n');
    expect(browserSessionCookie).not.toContain('always');
  });

  it('documents root-only token generation, server-scope inclusion, and rotation', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('ops/nginx/vndb-browser-session-map.conf.example');
    expect(readme).toContain('include /etc/nginx/snippets/vndb-browser-session-cookie.conf;');
    expect(readme).toContain('`server` scope');
    expect(readme).toContain('seven days');
    expect(readme).toContain('Rotate the browser-session token');
    expect(readme).toMatch(/A missing,\s+expired, or incorrect cookie still receives the Basic Auth challenge\./);
  });
});
