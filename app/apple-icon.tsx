import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7C3AED",
          borderRadius: 40,
        }}
      >
        <svg
          width="112"
          height="112"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9" />
          <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" />
          <circle cx="12" cy="9" r="2" />
          <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47" />
          <path d="M19.1 1.9a10.94 10.94 0 0 1 0 14.2" />
          <path d="M9.5 18h5" />
          <path d="m8 22 4-11 4 11" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
