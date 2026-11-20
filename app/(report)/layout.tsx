import { Libre_Baskerville, Playfair_Display } from "next/font/google";

const head = Playfair_Display({ subsets: ["latin"], variable: "--font-report-head", display: "swap" });
const body = Libre_Baskerville({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], variable: "--font-report-body", display: "swap" });

/** The report has no app chrome: no nav, nothing to hide when it prints. */
export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${head.variable} ${body.variable}`}>{children}</div>;
}
