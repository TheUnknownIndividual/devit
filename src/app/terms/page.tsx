import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms · devit" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="November 4, 2026">
      <p>By using devit you agree to these terms.</p>
      <section>
        <h2>Your content</h2>
        <p>You own the sites you build. You are responsible for what they say and for having the right to use any names, logos and images in them. Do not build sites that pretend to be another project, promote scams, or break the law. We may take such sites down.</p>
      </section>
      <section>
        <h2>Not financial advice</h2>
        <p>Price, chart and holder data on generated sites comes from public sources and may be late or wrong. Swaps and buys run on third-party protocols from the visitor&apos;s own wallet. Nothing on devit or on a generated site is financial advice.</p>
      </section>
      <section>
        <h2>Plans and payments</h2>
        <p>Paid plans are paid on chain through NEAR Intents. On-chain payments cannot be reversed by us; if something goes wrong with a payment, contact us and we will sort it out.</p>
      </section>
      <section>
        <h2>The service</h2>
        <p>devit is provided as is. AI output can contain mistakes, so check your site before you publish it. We may change or stop features, and we may suspend accounts that abuse the service.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We may update these terms. The date at the top shows the latest version.</p>
      </section>
    </LegalPage>
  );
}
