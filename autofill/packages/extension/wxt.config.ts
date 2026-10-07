import { defineConfig } from 'wxt';
import { EXTENSION_MANIFEST_KEY, SERVER_ORIGIN } from '@applier/protocol';

export default defineConfig({
  // The e2e suite builds elsewhere (AUTOFILL_OUT_DIR), so it never overwrites the dev build.
  outDir: process.env['AUTOFILL_OUT_DIR'] ?? '.output',
  // The bundle has no `process`: bake the build-time port override into it (see protocol/api.ts).
  vite: () => ({
    define: {
      'process.env.AUTOFILL_PORT': JSON.stringify(process.env['AUTOFILL_PORT'] ?? ''),
      // when this bundle was made: the background compares it with the build on disk (self-reload)
      __BUILT_AT__: JSON.stringify(Date.now()),
    },
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Applier Autofill',
    description:
      'Fills job-application forms from the local profile, and remembers and fills employer-portal logins from the private data repo. Never submits on its own.',
    // Pins the extension id, so the local server can hand passwords to this extension only.
    key: EXTENSION_MANIFEST_KEY,
    // `tabs`: the agent's commands open, find and close job-offer tabs by URL.
    permissions: ['storage', 'alarms', 'tabs'],
    // The service worker is the only thing that talks to the local plan server.
    host_permissions: [`${SERVER_ORIGIN}/*`],
    minimum_chrome_version: '111',
  },
});
