import { defineConfig } from 'wxt';
import { SERVER_ORIGIN } from '@applier/protocol';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Applier Autofill',
    description:
      'Fills Traffit, eRecruiter, justjoin.it and No Fluff Jobs application forms from the local profile. Never submits.',
    // The service worker is the only thing that talks to the local plan server.
    host_permissions: [`${SERVER_ORIGIN}/*`],
    minimum_chrome_version: '111',
  },
});
