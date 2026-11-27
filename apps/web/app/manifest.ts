import type { MetadataRoute } from 'next';

// T2-E 52 (answers 2741, 2875): YukthiX is installable (Add to Home Screen), which iPhone needs before it allows push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'YukthiX',
    short_name: 'YukthiX',
    start_url: '/yx/home',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1f4fd1',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  };
}
