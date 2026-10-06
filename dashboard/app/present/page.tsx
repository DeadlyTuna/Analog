import type { Metadata } from "next";
import { Deck } from "@/components/present/Deck";

export const metadata: Metadata = {
  title: "Presentation · AI-Based Motor Fault Detection",
  description: "Viva deck for the Analog Electronics semester 3 project, driven by the live motor simulator.",
};

export default function Present() {
  return <Deck />;
}
