import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        register: 'register.html',
        resident: 'resident.html',
        admin: 'admin.html',
        forgotPassword: 'forgot-password.html',
      },
    },
  },
  server: {
    port: 5173,
  },
});
