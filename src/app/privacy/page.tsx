import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy · sitesmith" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="November 4, 2026">
      <p>sitesmith is an AI website builder for web3 projects. This page explains what we store and why.</p>
      <section>
        <h2>What we store</h2>
        <ul>
          <li>Your account: the sign-in methods you add (Google, wallet, passkey or email), and the name and email they provide.</li>
          <li>Your projects: the prompts you write, the comments you leave, the sites the AI builds, and files you upload.</li>
          <li>Settings you enter for a project, such as a contract address, an RPC URL or a Privy app ID. Your own RPC URLs stay on our server and are never put in published pages.</li>
          <li>Plan and payment records, such as which plan you hold and the on-chain payments you made.</li>
        </ul>
      </section>
      <section>
        <h2>Google sign-in</h2>
        <p>When you continue with Google we ask only for your basic profile: your Google account ID, email and name. We use them to sign you in and to show who you are in your workspace. We do not read your Gmail, Drive, contacts or any other Google data, and we do not post anything for you.</p>
      </section>
      <section>
        <h2>AI processing</h2>
        <p>To build and edit your site, your prompt, comments and public token data are sent to an AI model. We use NEAR AI Cloud first, with Anthropic or OpenAI as a fallback. We do not sell your data or use it for advertising.</p>
      </section>
      <section>
        <h2>Published sites</h2>
        <p>Sites you publish are public. Private sites are shown only to people you allow. Visitors to published sites may connect a wallet; that connection happens in their browser and their wallet, not on our servers.</p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>We use cookies only to keep you signed in and to protect the sign-in flow. There are no ad or tracking cookies.</p>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>You can delete projects from your workspace at any time. To delete your whole account, ask us from the email on your account and we will remove it.</p>
      </section>
    </LegalPage>
  );
}
