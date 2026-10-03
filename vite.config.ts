import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' lets the built site work from any folder or sub-path
// (GitHub Pages, Netlify, a plain static host).
export default defineConfig({
  base: './',
  plugins: [react()],
})
