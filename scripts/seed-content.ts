import type { ResearchItem } from "../src/modules/content/domain/content-types";
import { getContentRepository } from "../src/modules/content/infrastructure/content-repository";

const now = new Date().toISOString();

/**
 * Illustrative development content. These items are hand-authored placeholders used to
 * exercise the read path locally; they are not real research records and carry no citation.
 * `createItem` upserts by id, so re-running the seed is safe.
 */
const seedItems: ResearchItem[] = [
  {
    id: "7c9f4b2e-0d3a-4c58-9f21-1a2b3c4d5e6f",
    title: "Sediment cores reveal rapid shifts in ocean circulation",
    abstract:
      "Illustrative record: layered sediment cores from the continental slope preserve a high-resolution archive of past sea-surface temperature and deep-water circulation. Alternating dark and light bands track changes in ice volume and current strength, offering a dated sequence for comparing abrupt climate events across regions.",
    summaryBn:
      "মহাদেশীয় ঢাল থেকে সংগৃহীত পলির স্তরগুলোতে সমুদ্রপৃষ্ঠের তাপমাত্রা ও গভীর পানির স্রোতের পরিবর্তনের একটি সূক্ষ্ম রেকর্ড সংরক্ষিত থাকে। গাঢ় ও হালকা স্তরের পর্যায়ক্রম বরফের পরিমাণ ও স্রোতের শক্তি নির্দেশ করে, যা বিভিন্ন অঞ্চলের আকস্মিক জলবায়ু পরিবর্তন তুলনা করার জন্য একটি সময়নির্ধারিত ধারা তৈরি করে।",
    sourceLanguage: "en",
    tags: ["climate", "oceanography"],
    status: "published",
    publishedAt: "2026-02-10T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "3d5e7a91-6b24-4f8c-8a13-9c0d1e2f3a4b",
    title: "Teaching computational literacy alongside historical method",
    abstract:
      "Illustrative discussion: university departments often separate computational skills from historical and philological training. This note argues that integrating data literacy with manuscript and archival study improves both source criticism and reproducibility, and sketches a sequencing model for undergraduate curricula in South Asia.",
    summaryBn:
      "বিশ্ববিদ্যালয়ের বিভাগগুলো প্রায়ই কম্পিউটেশনাল দক্ষতা ও ঐতিহাসিক-দার্শনিক প্রশিক্ষণকে আলাদা রাখে। এই নিবন্ধে যুক্তি দেওয়া হয়েছে, তথ্যজ্ঞান (ডেটা লিটারেসি) পাণ্ডুলিপি ও আর্কাইভ অধ্যয়নের সঙ্গে একীভূত করলে উৎস-সমালোচনা এবং পুনরুৎপাদনযোগ্যতা—দুটোই উন্নত হয়; সাথে দক্ষিণ এশিয়ার স্নাতক পাঠ্যক্রম সাজানোর একটি ধাপভিত্তিক মডেলও প্রস্তাব করা হয়েছে।",
    sourceLanguage: "en",
    tags: ["education", "ai-society"],
    status: "published",
    publishedAt: "2026-01-22T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "5a1c8e73-2f46-4d90-b7c5-6e8f9a0b1c2d",
    title: "Reconstructing urban knowledge systems from excavation records",
    abstract:
      "Illustrative record: archaeological evidence of standardized weights, drainage, and street grids suggests a codified approach to urban measurement. Re-examining excavation reports lets us compare engineering literacy across contemporaneous settlements without over-relying on trade-route explanations.",
    summaryBn:
      "আদর্শায়িত ওজন, নিষ্কাশনব্যবস্থা ও রাস্তার জালিকার প্রত্নতাত্ত্বিক প্রমাণ থেকে ইঙ্গিত মেলে যে নগর-পরিমাপের একটি সুসংহত পদ্ধতি প্রচলিত ছিল। খনন-প্রতিবেদন নতুন করে বিশ্লেষণ করলে বাণিজ্যপথের ব্যাখ্যার উপর অতিরিক্ত নির্ভর না করেই সমসাময়িক জনবসতিগুলোর প্রকৌশল-সাক্ষরতা তুলনা করা সম্ভব হয়।",
    sourceLanguage: "en",
    tags: ["archaeology", "history-of-science"],
    status: "published",
    publishedAt: "2026-03-05T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "9e2b6d48-7c13-4a5f-8b90-2d3e4f5a6b7c",
    title: "Draft: mapping regional archive coverage",
    abstract:
      "Illustrative draft: an inventory of which regional archives have digitized holdings, used to plan future comprehension coverage. Not published yet, so it must not appear in the list.",
    summaryBn:
      "খসড়া: কোন কোন আঞ্চলিক আর্কাইভের সংগ্রহ ডিজিটাল করা হয়েছে তার একটি তালিকা, ভবিষ্যতের কভারেজ পরিকল্পনার জন্য। এটি এখনো প্রকাশিত নয়, তাই তালিকায় দেখা যাবে না।",
    sourceLanguage: "en",
    tags: ["meta"],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  },
];

async function main() {
  const repository = getContentRepository();

  for (const item of seedItems) {
    await repository.createItem(item);
  }

  const published = seedItems.filter((item) => item.status === "published").length;

  console.log(`Seeded ${seedItems.length} content items (${published} published).`);
}

main().catch((error: unknown) => {
  console.error("Content seed failed.");
  console.error(error);
  process.exitCode = 1;
});
