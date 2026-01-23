// frontend/src/app/register/layout.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "賓客登記 | Event SaaS",
  description: "歡迎參加活動，請拍攝登記照",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}