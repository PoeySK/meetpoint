import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeetPoint | 함께 정하는 모임",
  description: "모임 시간과 장소를 함께 정하는 MeetPoint",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
