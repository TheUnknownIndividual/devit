import { ChevronDown } from "lucide-react";
import { FAQ } from "@/lib/seo";

// The landing's questions. The same list feeds the FAQPage structured data and /llms-full.txt, so what search
// engines and AI assistants read matches what people see.
export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 pt-20">
      <h2 data-reveal className="text-[28px] font-semibold tracking-[-0.02em] text-white">Questions</h2>
      <p data-reveal style={{ "--d": 1 } as React.CSSProperties} className="mt-2 max-w-[560px] text-[15px] text-zinc-400">The short answers. Anything else, ask in the builder and it will tell you.</p>
      <div data-reveal style={{ "--d": 2 } as React.CSSProperties} className="mt-8 grid gap-2 lg:grid-cols-2">
        {FAQ.map((f) => (
          <details key={f.q} className="group panel px-5 py-4 open:border-white/[0.14]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-white [&::-webkit-details-marker]:hidden">
              <h3 className="text-[15px] font-medium">{f.q}</h3>
              <ChevronDown size={16} className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2.5 text-[14px] leading-relaxed text-zinc-400">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
