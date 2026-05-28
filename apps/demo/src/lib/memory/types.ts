/** Fact kinds — kept in sync with the memory_fact_kind ENUM in
 *  20260515_user_memory_facts.sql. */
export const MEMORY_FACT_KINDS = [
  "name",
  "address",
  "property",
  "preference",
  "prior_issue",
  "contact",
  "other",
] as const;

export type MemoryFactKind = (typeof MEMORY_FACT_KINDS)[number];

export type ExtractedFact = {
  kind: MemoryFactKind;
  content: string;
};

export type StoredMemoryFact = {
  id: string;
  kind: MemoryFactKind;
  content: string;
  created_at: string;
  similarity?: number;
};
