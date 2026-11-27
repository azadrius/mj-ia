function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL", "postgres://mjia:mjia@localhost:5432/mjia"),
  port: Number(process.env.PORT ?? 3001),
  appUrl: required("APP_URL", "http://localhost:5173"),
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === "true",
  uploadDir: process.env.UPLOAD_DIR ?? new URL("../uploads", import.meta.url).pathname,
  isProduction: process.env.NODE_ENV === "production",
};

/** MJ IA : actif seulement si une clé API Anthropic est configurée. */
export const aiEnv = {
  enabled: Boolean(process.env.ANTHROPIC_API_KEY),
  model: process.env.AI_MODEL ?? "claude-opus-5-5",
  effort: (process.env.AI_EFFORT ?? "low") as "low" | "medium" | "high" | "xhigh" | "max",
};

/** Voix : Piper (gratuit, local) ou aucune. */
export const ttsEnv = {
  provider: (process.env.TTS_PROVIDER ?? "piper") as "piper" | "none",
  piperUrl: process.env.PIPER_URL ?? "http://localhost:5000",
  narratorVoice: process.env.PIPER_NARRATOR_VOICE ?? "fr_FR-siwis-medium",
  /** Les modèles à très nombreux locuteurs (ex. mls) sont limités pour garder des voix variées. */
  maxSpeakersPerModel: Number(process.env.PIPER_MAX_SPEAKERS ?? 20),
};

/** Bot Discord : actif seulement si un jeton de bot est configuré. */
export const discordEnv = {
  botToken: process.env.DISCORD_BOT_TOKEN ?? "",
};
