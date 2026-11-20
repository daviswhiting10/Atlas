"use client";

import { useRouter } from "next/navigation";
import styles from "./report.module.css";

/** Above the page, off the printout: the way back, and the one action (the print dialog saves a PDF). */
export function ReportBar() {
  const router = useRouter();
  return (
    <div className={styles.bar}>
      <button type="button" className={styles.quiet} onClick={() => router.back()} aria-label="Back">
        ← Back
      </button>
      <button type="button" onClick={() => window.print()}>
        Save as PDF
      </button>
    </div>
  );
}
