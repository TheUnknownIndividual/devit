"use client";

import { ArrowRight } from "lucide-react";

export function GetStarted() {
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => { document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "center" }); window.dispatchEvent(new CustomEvent("sitesmith:prompt", { detail: { focus: "address" } })); }}
    >
      Get started <ArrowRight size={15} className="nudge-r" />
    </button>
  );
}
