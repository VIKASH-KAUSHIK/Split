import { ImageResponse } from 'next/og';

export function generateImageMetadata() {
  return [
    { id: 'small', contentType: 'image/png', size: { width: 192, height: 192 } },
    { id: 'large', contentType: 'image/png', size: { width: 512, height: 512 } },
  ];
}

export default function Icon({ id }: { id: string }) {
  const size = id === 'small' ? 192 : 512;
  const radius = Math.round(size * 0.2);
  const fontSize = Math.round(size * 0.55);
  const letterSize = Math.round(size * 0.28);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1B998B 0%, #0d7a6e 100%)',
          borderRadius: radius,
        }}
      >
        {/* S letter */}
        <div
          style={{
            color: 'white',
            fontSize,
            fontWeight: 800,
            fontFamily: 'sans-serif',
            letterSpacing: '-0.05em',
            lineHeight: 1,
          }}
        >
          S
        </div>
        {/* small "it" subscript */}
        <div
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: letterSize,
            fontWeight: 600,
            fontFamily: 'sans-serif',
            alignSelf: 'flex-end',
            marginBottom: Math.round(size * 0.07),
            marginLeft: Math.round(size * -0.02),
          }}
        >
          it
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
