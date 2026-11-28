export type NavItem = {
  label: string;
  href: string;
};

export type ArchiveCard = {
  title: string;
  description: string;
  episode: string;
  accent: string;
};

export type VerificationStep = {
  title: string;
  description: string;
  status: "completed" | "active" | "upcoming";
};

export const publicNavItems: NavItem[] = [
  { label: "All Episodes", href: "/" },
  { label: "Research", href: "/content" },
  { label: "Scholars", href: "/scholar-verify" },
  { label: "Community", href: "/community" },
];

export const archiveCards: ArchiveCard[] = [
  {
    title: "The Quantum Revolution",
    description: "A cinematic deep-dive into the physics race reshaping computing, security, and materials science.",
    episode: "EP 01",
    accent: "linear-gradient(135deg, #13203f 0%, #294a8c 55%, #5ca3ff 100%)",
  },
  {
    title: "Future of AGI",
    description: "A Bangla-first guided series on frontier model capability, risk, and what AGI could mean for South Asia.",
    episode: "EP 08",
    accent: "linear-gradient(135deg, #1b1831 0%, #3b2f7a 55%, #6ca6ff 100%)",
  },
  {
    title: "Neuroplasticity 101",
    description: "Understand how the brain rewires itself and what that means for learning, memory, and habit design.",
    episode: "EP 12",
    accent: "linear-gradient(135deg, #132a29 0%, #1e5d63 55%, #8be8ff 100%)",
  },
  {
    title: "Synthetic Biology",
    description: "An accessible series on programmable cells, wet-lab ethics, and the next era of bioengineering.",
    episode: "EP 04",
    accent: "linear-gradient(135deg, #23192d 0%, #4d3a79 55%, #7bc4ff 100%)",
  },
];

export const verificationSteps: VerificationStep[] = [
  {
    title: "Identity",
    description: "Confirm who you are and how learners should recognize you.",
    status: "completed",
  },
  {
    title: "Credentials",
    description: "Share verifiable academic and professional evidence.",
    status: "active",
  },
  {
    title: "Specialization",
    description: "Declare research areas, languages, and teaching strength.",
    status: "upcoming",
  },
  {
    title: "Verification",
    description: "Final review by the Okkhor scholarly committee.",
    status: "upcoming",
  },
];

export const trustHighlights = [
  "Proof-of-action confirmations for OTP, subscription, and profile changes",
  "Visible watch history, subscription status, and transaction records",
  "Quick logout and profile switching for shared household devices",
];
