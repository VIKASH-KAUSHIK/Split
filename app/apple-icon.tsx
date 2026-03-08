import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1B998B 0%, #0d7a6e 100%)',
          borderRadius: 40,
        }}
      >
        <div
          style={{
            color: 'white',
            fontSize: 100,
            fontWeight: 800,
            fontFamily: 'sans-serif',
            lineHeight: 1,
          }}
        >
          S
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: 50,
            fontWeight: 600,
            fontFamily: 'sans-serif',
            alignSelf: 'flex-end',
            marginBottom: 12,
            marginLeft: -4,
          }}
        >
          it
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
