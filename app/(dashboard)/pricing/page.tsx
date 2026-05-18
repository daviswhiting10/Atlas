import { FileText, ExternalLink } from "lucide-react";

const CREDENTIALS = [
  { label: "NASM Certified Personal Trainer (CPT)", file: "/credentials/CPT.pdf" },
  { label: "NASM Certified Nutrition Coach (CNC)", file: "/credentials/CNC.pdf" },
  { label: "DPT Stretch Specialist", file: "/credentials/stretch-specialist.pdf" },
];

export default function PricingPage() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Davis Whiting · NASM CPT · Life Time Columbia, MD · 513-828-8682
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dynamic Personal Training */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-bold text-primary mb-4 pb-3 border-b border-border">
            Dynamic Personal Training 1:1
          </h2>

          <div className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">50 Min. Sessions</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-medium pb-2">Frequency</th>
                  <th className="text-right font-medium pb-2">Session</th>
                  <th className="text-right font-medium pb-2">Month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 text-foreground">1x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$150</td>
                  <td className="py-2 text-right font-semibold">$600</td>
                </tr>
                <tr>
                  <td className="py-2 text-foreground">2x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$140</td>
                  <td className="py-2 text-right font-semibold">$1,120</td>
                </tr>
                <tr>
                  <td className="py-2 text-foreground">3x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$130</td>
                  <td className="py-2 text-right font-semibold">$1,560</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">30 Min. Sessions</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-medium pb-2">Frequency</th>
                  <th className="text-right font-medium pb-2">Session</th>
                  <th className="text-right font-medium pb-2">Month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 text-foreground">1x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$90</td>
                  <td className="py-2 text-right font-semibold">$360</td>
                </tr>
                <tr>
                  <td className="py-2 text-foreground">2x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$85</td>
                  <td className="py-2 text-right font-semibold">$680</td>
                </tr>
                <tr>
                  <td className="py-2 text-foreground">3x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$80</td>
                  <td className="py-2 text-right font-semibold">$960</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Dynamic Stretch */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-bold text-primary mb-4 pb-3 border-b border-border">
            Dynamic Stretch
          </h2>

          <div className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">50 Min. Sessions</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-medium pb-2">Frequency</th>
                  <th className="text-right font-medium pb-2">Session</th>
                  <th className="text-right font-medium pb-2">Month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 text-foreground">1x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$130</td>
                  <td className="py-2 text-right font-semibold">$520</td>
                </tr>
                <tr>
                  <td className="py-2 text-foreground">2x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$120</td>
                  <td className="py-2 text-right font-semibold">$960</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">30 Min. Sessions</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-medium pb-2">Frequency</th>
                  <th className="text-right font-medium pb-2">Session</th>
                  <th className="text-right font-medium pb-2">Month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 text-foreground">1x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$90</td>
                  <td className="py-2 text-right font-semibold">$360</td>
                </tr>
                <tr>
                  <td className="py-2 text-foreground">2x a week</td>
                  <td className="py-2 text-right text-muted-foreground">$80</td>
                  <td className="py-2 text-right font-semibold">$640</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground text-center mt-6">
        All training programs are tailored to your unique goals and lifestyle.
        Contact Davis to schedule your initial consultation.
      </p>

      {/* Credentials */}
      <div className="mt-10">
        <h2 className="text-base font-semibold mb-3">Credentials</h2>
        <div className="flex flex-col gap-2">
          {CREDENTIALS.map((c) => (
            <a
              key={c.file}
              href={c.file}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors"
            >
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium flex-1">{c.label}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
