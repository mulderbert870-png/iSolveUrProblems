import { applyRules } from "./rules";
import type { ClassifyResult, ClassifyContext } from "./types";

/**
 * M3.0e — Top-level classifier.
 *
 * This is the public entry point the API route + orchestrator call.
 * Today it's a thin wrapper over rule application; future versions
 * may layer an LLM disambiguator on top (Q3.0c upgrade path) without
 * changing this signature.
 *
 * Pure / synchronous / no I/O — safe to call repeatedly on every
 * transcript turn.
 *
 * `ctx.tz` flows into time-aware rules so "tomorrow at 10am" lands at
 * 10am in the homeowner's wall clock, not 10am UTC.
 */
export function classifyIntent(
  text: string,
  ctx: ClassifyContext = {},
): ClassifyResult {
  return applyRules(text, ctx);
}
