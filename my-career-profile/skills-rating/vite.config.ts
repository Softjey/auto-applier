import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { skillsApi } from './server/skillsApi';

export default defineConfig({
  plugins: [react(), skillsApi()],
  server: {
    port: 5173,
    open: true,
  },
});
