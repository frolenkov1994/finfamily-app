import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "FinFamily — семейные финансы",
  description: "Общий обзор личных и семейных финансов в белорусских рублях"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
