// frontend/src/app/photographer/layout.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "攝影師工作台 | Event SaaS",
  description: "攝影師專屬後台，管理照片與賓客",
};

export default function PhotographerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}