import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({ plugins: [react(), VitePWA({ registerType: 'autoUpdate', includeAssets: ['icons/icon.svg'], manifest: { name: 'ChatFlow', short_name: 'ChatFlow', description: 'Messagerie moderne', theme_color: '#2563EB', background_color: '#F7F9FC', display: 'standalone', start_url: '/', icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] } })] })
