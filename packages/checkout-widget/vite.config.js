import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/checkout-element.jsx',
      name: 'OrbitCheckout',
      formats: ['umd', 'es'],
      fileName: () => 'orbit-checkout.js',
    },
  },
  server: {
    port: 5173
  }
})
