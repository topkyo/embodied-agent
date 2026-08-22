export type SimMatrixSlice = "core" | "wechat" | "negative";
export type SimMatrixCorpusSource = "golden" | "extra" | "wechat" | "negative";

export type SimMatrixReportEvidence = {
  slice: SimMatrixSlice;
  path: string | null;
  ok: boolean;
  fresh: boolean;
  at?: string;
  pass_rate?: number;
  min_pass_rate?: number;
  total?: number;
  detail: string;
};

export type SimMatrixCorpusRowEvidence = {
  source: SimMatrixCorpusSource;
  hash: string;
};

export type SimMatrixCorpusEvidence = {
  rows: number;
  digest: string;
  row_hashes: SimMatrixCorpusRowEvidence[];
};

export type SimMatrixEvidenceFingerprintInput = {
  deployment_id: string;
  active_domain: string;
  llm_provider?: string;
  llm_base_url?: string;
  model: string;
  llm_thinking?: boolean;
  domainConfig?: unknown;
};
