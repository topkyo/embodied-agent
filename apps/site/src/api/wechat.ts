export type LangSuggest = {
  lang: "zh" | "en";
  country: string | null;
  source: string;
};

export async function suggestLang(): Promise<LangSuggest> {
  const res = await fetch("/lang-suggest");
  if (!res.ok) {
    return { lang: "zh", country: null, source: "default" };
  }
  return (await res.json()) as LangSuggest;
}
