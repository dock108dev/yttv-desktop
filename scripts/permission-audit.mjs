export function auditManifest(m) {
  const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!exact(m.permissions, ['storage']) || !exact(m.optional_permissions, ['system.display', 'scripting']) ||
      !exact(m.host_permissions, ['https://tv.youtube.com/*']) || !exact(m.optional_host_permissions, ['https://www.youtube.com/*', 'https://www.primevideo.com/*', 'https://www.netflix.com/*']) ||
      !exact(m.content_scripts, [{ matches: ['https://tv.youtube.com/*'], js: ['content.js'], run_at: 'document_start' }]) ||
      !exact(m.content_security_policy, { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" }) ||
      m.externally_connectable || m.web_accessible_resources || m.sandbox) throw Error('Unexpected extension permission or injection expansion');
}
