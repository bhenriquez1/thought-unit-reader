import type {
  ActivePageContext,
  AudienceMode,
  DepthMode,
  PriorityPayload,
  ExplainPayload,
  RelationsPayload,
  ComparePayload,
  InsightsPayload,
  ResolvedPanelPayload,
} from "./readerContracts";

function firstSentence(text: string): string {
  const match = text.match(/(.+?[.!?])(\s|$)/);
  return match?.[1]?.trim() || text.slice(0, 180).trim();
}

function topSentences(paragraphs: string[], count = 3): string[] {
  return paragraphs
    .filter((p) => p.length > 30)
    .slice(0, count)
    .map((p) => firstSentence(p));
}

function detectDiscipline(text: string): "math" | "clinical" | "history" | "law" | "general" {
  const lower = text.toLowerCase();
  if (/(equation|function|theorem|derivative|integral|matrix|graph|formula)/.test(lower)) return "math";
  if (/(patient|diagnosis|clinical|tooth|disease|treatment|exam|pathology)/.test(lower)) return "clinical";
  if (/(statute|holding|court|plaintiff|defendant|jurisdiction|contract)/.test(lower)) return "law";
  if (/(empire|war|century|revolution|primary source|historian)/.test(lower)) return "history";
  return "general";
}

function audienceTransform(text: string, audience: AudienceMode): string {
  if (audience === "student") return text;
  if (audience === "clinical") return `Clinical frame: ${text}`;
  return `Advanced frame: ${text}`;
}

function buildPriority(ctx: ActivePageContext, audience: AudienceMode): PriorityPayload {
  const discipline = detectDiscipline(ctx.pageText);
  const ideas = topSentences(ctx.paragraphTexts, 4);

  const meaningBase =
    discipline === "math"
      ? "This page is establishing the core mathematical idea, what objects are related, and how to interpret the rule or formula."
      : discipline === "clinical"
      ? "This page is helping you identify what matters clinically, what the signs mean, and how the information changes diagnosis or treatment."
      : discipline === "history"
      ? "This page is establishing the main historical claim, what evidence supports it, and why that context matters."
      : discipline === "law"
      ? "This page is clarifying the controlling rule, how the doctrine works, and when it applies."
      : "This page is introducing the main concept, what it means, and what the learner should pay attention to first.";

  return {
    title: ctx.sectionTitle || ctx.chapterTitle || `Page ${ctx.pageNumber}`,
    meaning: audienceTransform(meaningBase, audience),
    mainIdeas: ideas,
    whyItMatters: audienceTransform(
      "You should leave this page knowing the central idea, the key distinctions, and the first practical use of the concept.",
      audience,
    ),
    whatToRemember: ideas.slice(0, 3),
    supportingQuote: ideas[0],
  };
}

function buildExplain(ctx: ActivePageContext, audience: AudienceMode, depth: DepthMode): ExplainPayload {
  const key = firstSentence(ctx.pageText);
  const stepwise = [
    `Start with the page's core claim: ${key}`,
    "Then identify what is being defined, compared, explained, or applied.",
    "Next connect it to nearby ideas so it is not memorized in isolation.",
    "Finally ask how this concept would appear in a question, problem, or real situation.",
  ];

  const application = [
    "Turn the page into 1 recall question.",
    "Turn it into 1 application question.",
    "State the most likely confusion or trap.",
  ];

  return {
    title: ctx.sectionTitle || ctx.chapterTitle || `Page ${ctx.pageNumber}`,
    whatThisMeans: audienceTransform(
      "This page should be understood as a teaching unit: identify the claim, the supporting logic, and the way it would be used.",
      audience,
    ),
    mechanism: audienceTransform(
      "Mechanism means the why: what drives the result, what causes the pattern, or what rule connects the pieces.",
      audience,
    ),
    stepwise: depth === "deep" ? stepwise : stepwise.slice(0, 3),
    application,
  };
}

function buildRelations(ctx: ActivePageContext): RelationsPayload {
  const snippets = topSentences(ctx.paragraphTexts, 3);
  return {
    title: ctx.sectionTitle || ctx.chapterTitle || `Page ${ctx.pageNumber}`,
    prerequisites: snippets.slice(0, 1),
    currentLinks: snippets.slice(0, 2),
    downstreamLinks: snippets.slice(1, 3),
  };
}

function buildCompare(ctx: ActivePageContext): ComparePayload {
  const text = ctx.pageText.toLowerCase();

  if (/different|whereas|unlike|compared with|vs\.?|versus/.test(text)) {
    return {
      title: ctx.sectionTitle || ctx.chapterTitle || `Page ${ctx.pageNumber}`,
      comparePairs: [
        {
          left: "Current idea",
          right: "Contrasted idea",
          distinction: "This page contains an explicit contrast that should be turned into a difference test.",
        },
      ],
    };
  }

  return {
    title: ctx.sectionTitle || ctx.chapterTitle || `Page ${ctx.pageNumber}`,
    comparePairs: [],
    emptyReason: "No explicit compare pair is grounded on this page yet.",
  };
}

function buildInsights(ctx: ActivePageContext): InsightsPayload {
  const ideas = topSentences(ctx.paragraphTexts, 3);
  return {
    title: ctx.sectionTitle || ctx.chapterTitle || `Page ${ctx.pageNumber}`,
    highYield: ideas,
    traps: [
      "Do not memorize isolated wording without understanding the concept.",
      "Watch for look-alike terms or definitions.",
    ],
    hiddenConnections: [
      "Ask what previous concept this depends on.",
      "Ask what later concept this will support.",
    ],
  };
}

export function resolvePanelPayload(
  ctx: ActivePageContext,
  audience: AudienceMode,
  depth: DepthMode,
): ResolvedPanelPayload {
  return {
    priority: buildPriority(ctx, audience),
    explain: buildExplain(ctx, audience, depth),
    relations: buildRelations(ctx),
    compare: buildCompare(ctx),
    insights: buildInsights(ctx),
  };
}
