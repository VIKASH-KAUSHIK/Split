import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Split-It',
    short_name: 'Split-It',
    description: 'Split bills and expenses effortlessly with friends and groups.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#1B998B',
    orientation: 'portrait',
    categories: ['finance', 'utilities'],
    icons: [
      {
        src: '/icon/small',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon/large',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
