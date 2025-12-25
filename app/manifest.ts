import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Let's Meet",
    short_name: "Let's Meet",
    description: "Connect and learn with students on Let's Meet.",
    start_url: '/',
    display: 'standalone',
    background_color: '#2563eb',
    theme_color: '#2563eb',
    icons: [
      {
        src: 'https://cdn-icons-png.flaticon.com/512/5836/5836611.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'https://cdn-icons-png.flaticon.com/512/5836/5836611.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}