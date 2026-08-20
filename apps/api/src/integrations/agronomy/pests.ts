import knowledge from "./pests-knowledge.json" with { type: "json" };

export type PestKnowledgeEntry = {
  keywords: string[];
  title: string;
  advice: string;
};

const ENTRIES = knowledge as PestKnowledgeEntry[];

export function lookupPestAdvice(query: string): PestKnowledgeEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = ENTRIES.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw.toLowerCase()) || kw.toLowerCase().includes(q)) {
        score += 2;
      }
    }
    if (entry.title.toLowerCase().includes(q)) score += 3;
    return { entry, score };
  }).filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((r) => r.entry);
}

export function formatPestAdviceReply(query: string): string {
  const hits = lookupPestAdvice(query);
  if (hits.length === 0) {
    return `未在知识库中找到与「${query}」直接相关的病虫害条目。可尝试描述症状（如高湿霉病、蚜虫）或作物名称。`;
  }
  return hits.map((h, i) => `${i + 1}. ${h.title}：${h.advice}`).join("\n");
}
