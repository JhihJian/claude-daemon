/**
 * collector.ts - Result collection and aggregation
 *
 * Collects results from multiple agents, performs de-duplication,
 * consensus checking, and generates comprehensive reports.
 */

import type {
  AgentExecutionResult,
  CollectedResults,
} from "./types.js";

export interface CollectorOptions {
  removeDuplicates?: boolean;
  checkConsensus?: boolean;
  mergeStrategy?: "concat" | "smart" | "vote";
  timeoutMs?: number;
}

/**
 * Result Collector - aggregates and analyzes multi-agent results
 */
export class ResultCollector {
  private options: CollectorOptions;

  constructor(options: CollectorOptions = {}) {
    this.options = {
      removeDuplicates: true,
      checkConsensus: true,
      mergeStrategy: "smart",
      timeoutMs: 300000,
      ...options,
    };
  }

  /**
   * Collect results from multiple agents
   */
  async collect(results: AgentExecutionResult[]): Promise<CollectedResults> {
    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const partialCount = results.filter((r) => r.status === "partial").length;

    let processedResults = results;

    // Remove duplicates if enabled
    if (this.options.removeDuplicates) {
      processedResults = this.deduplicateResults(processedResults);
    }

    // Check consensus if enabled
    let consensus;
    if (this.options.checkConsensus && successCount > 1) {
      consensus = this.checkConsensus(processedResults.filter((r) => r.status === "success"));
    }

    // Generate summary
    const summary = this.generateSummary(processedResults, consensus);

    return {
      mode: "mixed", // Will be set by caller
      totalAgents: results.length,
      successCount,
      failedCount,
      partialCount,
      results: processedResults,
      summary,
      consensus,
    };
  }

  /**
   * Remove duplicate results
   */
  private deduplicateResults(results: AgentExecutionResult[]): AgentExecutionResult[] {
    const seen = new Set<string>();
    const unique: AgentExecutionResult[] = [];

    for (const result of results) {
      // Create fingerprint of result
      const fingerprint = this.createFingerprint(result);

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        unique.push(result);
      }
    }

    return unique;
  }

  /**
   * Create fingerprint for result comparison
   */
  private createFingerprint(result: AgentExecutionResult): string {
    const normalized = result.result
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "")
      .trim();

    // Hash by taking first and last 50 chars + length
    const len = normalized.length;
    if (len < 100) {
      return normalized;
    }

    return normalized.slice(0, 50) + normalized.slice(-50) + len.toString();
  }

  /**
   * Check consensus among successful results
   */
  private checkConsensus(results: AgentExecutionResult[]): CollectedResults["consensus"] {
    if (results.length < 2) {
      return undefined;
    }

    const texts = results.map((r) => r.result.toLowerCase());
    const totalWords = new Set<string>();

    // Collect all unique words
    texts.forEach((t) => {
      t.split(/\s+/).forEach((w) => {
        if (w.length > 3) totalWords.add(w);
      });
    });

    // Count word occurrences across all results
    const wordOccurrences = new Map<string, number>();
    texts.forEach((t) => {
      const wordsInResult = new Set(t.split(/\s+/).filter((w) => w.length > 3));
      wordsInResult.forEach((w) => {
        wordOccurrences.set(w, (wordOccurrences.get(w) || 0) + 1);
      });
    });

    // Find common words (present in all results)
    const commonWords = Array.from(wordOccurrences.entries())
      .filter(([_, count]) => count === results.length)
      .map(([word]) => word)
      .sort();

    // Calculate agreement score
    const agreement = totalWords.size > 0
      ? commonWords.length / totalWords.size
      : 0;

    const hasConsensus = agreement > 0.4; // 40% threshold

    return {
      hasConsensus,
      agreement: Math.min(agreement, 1),
      details: this.generateConsensusDetails(commonWords, totalWords.size, results.length),
    };
  }

  /**
   * Generate detailed consensus report
   */
  private generateConsensusDetails(
    commonWords: string[],
    totalUniqueWords: number,
    resultCount: number
  ): string {
    const topWords = commonWords.slice(0, 20);
    const agreement = totalUniqueWords > 0
      ? (commonWords.length / totalUniqueWords * 100).toFixed(1)
      : "0.0";

    let details = `Consensus analysis across ${resultCount} results:\n`;
    details += `- Agreement level: ${agreement}%\n`;
    details += `- Common concepts: ${commonWords.length}/${totalUniqueWords}\n`;

    if (topWords.length > 0) {
      details += `- Top shared terms: ${topWords.slice(0, 10).join(", ")}\n`;
    }

    return details;
  }

  /**
   * Generate comprehensive summary
   */
  private generateSummary(
    results: AgentExecutionResult[],
    consensus?: CollectedResults["consensus"]
  ): string {
    let summary = "## Execution Summary\n\n";

    // Overall stats
    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const partialCount = results.filter((r) => r.status === "partial").length;

    summary += `### Results Overview\n`;
    summary += `- Total Agents: ${results.length}\n`;
    summary += `- ✅ Successful: ${successCount}\n`;
    summary += `- ❌ Failed: ${failedCount}\n`;
    summary += `- ⚠️ Partial: ${partialCount}\n\n`;

    // Consensus info
    if (consensus) {
      summary += `### Consensus Analysis\n`;
      summary += `- Has Consensus: ${consensus.hasConsensus ? "Yes" : "No"}\n`;
      summary += `- Agreement Score: ${(consensus.agreement * 100).toFixed(1)}%\n`;
      summary += `\n${consensus.details}\n\n`;
    }

    // Timing
    const durations = results.map((r) => r.duration).filter((d) => d > 0);
    if (durations.length > 0) {
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      summary += `### Performance\n`;
      summary += `- Average Duration: ${(avgDuration / 1000).toFixed(1)}s\n`;
      summary += `- Min Duration: ${(minDuration / 1000).toFixed(1)}s\n`;
      summary += `- Max Duration: ${(maxDuration / 1000).toFixed(1)}s\n\n`;
    }

    // Individual results
    summary += `### Individual Results\n\n`;

    for (const result of results) {
      const statusIcon = result.status === "success" ? "✅" :
                        result.status === "failed" ? "❌" : "⚠️";

      summary += `#### ${statusIcon} ${result.agentLabel}\n`;
      summary += `- Task ID: ${result.taskId}\n`;
      summary += `- Status: ${result.status}\n`;
      summary += `- Duration: ${(result.duration / 1000).toFixed(1)}s\n`;

      if (result.error) {
        summary += `- Error: ${result.error}\n`;
      }

      // Preview of result
      const preview = result.result.slice(0, 300);
      summary += `\n${preview}${result.result.length > 300 ? "..." : ""}\n\n`;
    }

    return summary;
  }

  /**
   * Merge results using configured strategy
   */
  mergeResults(results: AgentExecutionResult[]): string {
    const successful = results.filter((r) => r.status === "success");

    if (successful.length === 0) {
      return "No successful results to merge.";
    }

    switch (this.options.mergeStrategy) {
      case "concat":
        return this.concatMerge(successful);

      case "vote":
        return this.voteMerge(successful);

      case "smart":
      default:
        return this.smartMerge(successful);
    }
  }

  /**
   * Simple concatenation merge
   */
  private concatMerge(results: AgentExecutionResult[]): string {
    return results
      .map((r, i) => `## Result from ${r.agentLabel}\n\n${r.result}`)
      .join("\n\n---\n\n");
  }

  /**
   * Voting-based merge (most common answers)
   */
  private voteMerge(results: AgentExecutionResult[]): string {
    // This is a simplified version - in practice would need more sophisticated NLP
    const combined = new Map<string, number>();

    results.forEach((r) => {
      const sentences = r.result.split(/[.!?]+/).filter((s) => s.trim().length > 10);
      sentences.forEach((s) => {
        const key = s.trim().toLowerCase().slice(0, 100);
        combined.set(key, (combined.get(key) || 0) + 1);
      });
    });

    // Get most common sentences
    const topSentences = Array.from(combined.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([s]) => s);

    return `## Merged Result (Most Common Points)\n\n${topSentences.join(".\n\n")}.`;
  }

  /**
   * Smart merge with deduplication and organization
   */
  private smartMerge(results: AgentExecutionResult[]): string {
    let merged = "## Merged Analysis\n\n";

    // Group by themes using keyword detection
    const themes = this.groupByThemes(results);

    for (const [theme, points] of themes.entries()) {
      merged += `### ${theme}\n\n`;
      for (const point of points) {
        merged += `- ${point}\n`;
      }
      merged += "\n";
    }

    // Add unique insights from each agent
    merged += `### Unique Insights\n\n`;
    for (const result of results) {
      const uniquePoints = this.extractUniquePoints(result.result, results);
      if (uniquePoints.length > 0) {
        merged += `#### ${result.agentLabel}\n`;
        for (const point of uniquePoints.slice(0, 3)) {
          merged += `- ${point}\n`;
        }
        merged += "\n";
      }
    }

    return merged;
  }

  /**
   * Group results by themes using keyword clustering
   */
  private groupByThemes(results: AgentExecutionResult[]): Map<string, string[]> {
    const themes = new Map<string, string[]>();

    const themeKeywords: Record<string, string[]> = {
      "Architecture": ["architecture", "design", "structure", "pattern", "component"],
      "Security": ["security", "vulnerability", "auth", "permission", "encryption"],
      "Performance": ["performance", "optimization", "speed", "latency", "cache"],
      "Code Quality": ["quality", "maintainability", "readability", "convention", "style"],
      "Testing": ["test", "coverage", "unit", "integration", "mock"],
      "Dependencies": ["dependency", "package", "library", "version", "module"],
      "Documentation": ["documentation", "readme", "comment", "docstring", "guide"],
      "Error Handling": ["error", "exception", "validation", "check", "handle"],
    };

    for (const result of results) {
      const sentences = result.result.split(/[.!?]+/).filter((s) => s.trim().length > 15);

      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        let assigned = false;

        for (const [theme, keywords] of Object.entries(themeKeywords)) {
          if (keywords.some((kw) => lower.includes(kw))) {
            if (!themes.has(theme)) themes.set(theme, []);
            themes.get(theme)!.push(sentence.trim());
            assigned = true;
            break;
          }
        }

        if (!assigned) {
          if (!themes.has("General")) themes.set("General", []);
          themes.get("General")!.push(sentence.trim());
        }
      }
    }

    return themes;
  }

  /**
   * Extract unique points from a result compared to others
   */
  private extractUniquePoints(
    result: AgentExecutionResult,
    allResults: AgentExecutionResult[]
  ): string[] {
    const wordsInResult = new Set(
      result.result
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4)
    );

    const otherResults = allResults.filter((r) => r.agentId !== result.agentId);
    const commonWords = new Set<string>();

    for (const other of otherResults) {
      const otherWords = new Set(
        other.result
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 4)
      );

      for (const word of wordsInResult) {
        if (otherWords.has(word)) {
          commonWords.add(word);
        }
      }
    }

    // Find sentences with unique words
    const sentences = result.result.split(/[.!?]+/).filter((s) => s.trim().length > 15);
    const uniqueSentences: string[] = [];

    for (const sentence of sentences) {
      const words = sentence
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);

      const uniqueWordCount = words.filter((w) => !commonWords.has(w)).length;

      if (uniqueWordCount >= 2) {
        uniqueSentences.push(sentence.trim());
      }
    }

    return uniqueSentences;
  }

  /**
   * Detect result consistency
   */
  detectConsistency(results: AgentExecutionResult[]): {
    isConsistent: boolean;
    inconsistencies: string[];
  } {
    const inconsistencies: string[] = [];
    const successful = results.filter((r) => r.status === "success");

    if (successful.length < 2) {
      return { isConsistent: true, inconsistencies: [] };
    }

    // Check for contradictory conclusions
    const conclusions = successful.map((r) => this.extractConclusion(r.result));

    // Simple heuristic: if conclusions have very different sentiment
    const sentiments = conclusions.map((c) => this.detectSentiment(c));
    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;

    for (let i = 0; i < sentiments.length; i++) {
      if (Math.abs(sentiments[i] - avgSentiment) > 0.5) {
        inconsistencies.push(
          `${successful[i].agentLabel} has a different conclusion than the majority`
        );
      }
    }

    return {
      isConsistent: inconsistencies.length === 0,
      inconsistencies,
    };
  }

  /**
   * Extract conclusion from result text
   */
  private extractConclusion(text: string): string {
    const conclusionStarts = [
      "in conclusion",
      "summary",
      "overall",
      "finally",
      "to summarize",
    ];

    const lower = text.toLowerCase();
    let bestStart = -1;

    for (const phrase of conclusionStarts) {
      const idx = lower.indexOf(phrase);
      if (idx !== -1 && idx > bestStart) {
        bestStart = idx;
      }
    }

    if (bestStart !== -1) {
      return text.slice(bestStart);
    }

    // Last paragraph as fallback
    const paragraphs = text.split("\n\n");
    return paragraphs[paragraphs.length - 1] || text.slice(-200);
  }

  /**
   * Simple sentiment detection (-1 to 1)
   */
  private detectSentiment(text: string): number {
    const positiveWords = ["good", "great", "excellent", "recommend", "solid", "well"];
    const negativeWords = ["bad", "poor", "issue", "problem", "concern", "fail"];

    const lower = text.toLowerCase();
    let score = 0;

    for (const word of positiveWords) {
      if (lower.includes(word)) score += 0.2;
    }

    for (const word of negativeWords) {
      if (lower.includes(word)) score -= 0.2;
    }

    return Math.max(-1, Math.min(1, score));
  }
}

/**
 * Create a default collector instance
 */
export function createCollector(options?: CollectorOptions): ResultCollector {
  return new ResultCollector(options);
}
