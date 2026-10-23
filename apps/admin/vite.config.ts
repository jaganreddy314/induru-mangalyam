import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lets the GitHub Pages build live under /<repo>/admin/.
// Separates this app's stored session from the other app on the same origin.
process.env.VITE_APP_ID ??= 'admin';

export default defineConfig({ base: process.env.BASE_PATH ?? '/', plugins: [react()], server: { port: 5174 } });
