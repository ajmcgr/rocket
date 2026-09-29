import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifySource, extractHtml, isPublicAddress, normalizeSourceUrl, parsePublicUrl } from '../supabase/functions/_shared/appIngestion.ts';

test('rejects SSRF targets and non-web protocols', () => {
  for (const url of [
    'http://localhost/', 'http://foo.local/', 'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/',
    'http://[::1]/', 'file:///etc/passwd', 'javascript:alert(1)',
    'data:text/html,hi', 'https://user:pass@example.com/',
    'https://example.com:8443/',
  ]) assert.throws(() => parsePublicUrl(url), url);
  for (const ip of ['127.0.0.1','10.1.1.1','172.16.1.1','192.168.1.1','169.254.169.254',
    '100.64.0.1','0.0.0.0','192.0.2.1','198.51.100.1','203.0.113.1','::1','fe80::1',
    'fc00::1','::ffff:127.0.0.1','2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('normalizes common URL variants but keeps identity parameters', () => {
  assert.equal(normalizeSourceUrl('http://www.example.com/foo/?utm_source=ad&id=4#section'),
    'https://example.com/foo?id=4');
  assert.equal(normalizeSourceUrl('https://example.com/foo/'), normalizeSourceUrl('https://www.example.com/foo'));
});

test('classifies the supported source adapters', () => {
  assert.equal(classifySource(parsePublicUrl('https://trylaunch.ai/launch/example')), 'launch');
  assert.equal(classifySource(parsePublicUrl('https://github.com/owner/repo')), 'github');
  assert.equal(classifySource(parsePublicUrl('https://news.ycombinator.com/item?id=123')), 'hacker_news');
  assert.equal(classifySource(parsePublicUrl('https://producthunt.com/posts/example')), 'unsupported');
  assert.equal(classifySource(parsePublicUrl('https://example.com')), 'website');
});

test('extracts deterministic public metadata without executing scripts', () => {
  const html = `<title>Acme | Build faster</title><meta content="An app for teams" name="description">
    <meta property="og:image" content="/logo.png"><link href="https://acme.com/" rel="canonical">
    <script>alert('not executed')</script>`;
  const data = extractHtml(html, 'https://www.acme.com/');
  assert.equal(data.name, 'Acme');
  assert.equal(data.description, 'An app for teams');
  assert.equal(data.imageUrl, 'https://www.acme.com/logo.png');
});
