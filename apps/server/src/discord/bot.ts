import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import type { ChatMessage, MessageAudio } from "@mj-ia/shared";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
} from "discord.js";
import { and, eq, isNotNull } from "drizzle-orm";
import { handleChatInput, messageListeners } from "../chat";
import { db } from "../db/client";
import { loadMember } from "../db/load";
import { campaigns, users } from "../db/schema";
import { discordEnv, env } from "../env";
import { parseWav, toDiscordPcm } from "./audio";
import { formatForDiscord } from "./format";

/**
 * Bot Discord : il relie un salon textuel et un salon vocal à une campagne.
 * - Les répliques publiques de l'IA sont lues dans le salon vocal (voix Piper).
 * - Le chat de la table et le salon textuel se répondent dans les deux sens.
 */

const commands = [
  new SlashCommandBuilder()
    .setName("mj")
    .setDescription("MJ IA : relier ce salon à une campagne")
    .addSubcommand((s) =>
      s
        .setName("lier")
        .setDescription("Relie ce salon à ta campagne (MJ seulement)")
        .addStringOption((o) => o.setName("code").setDescription("Code d'invitation de la campagne").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("rejoindre").setDescription("Le bot rejoint ton salon vocal et y lit les répliques"))
    .addSubcommand((s) => s.setName("quitter").setDescription("Le bot quitte le salon vocal"))
    .addSubcommand((s) => s.setName("delier").setDescription("Retire le lien entre ce serveur et la campagne"))
    .addSubcommand((s) => s.setName("statut").setDescription("Affiche la campagne liée")),
  new SlashCommandBuilder()
    .setName("r")
    .setDescription("Lancer des dés à la table")
    .addStringOption((o) => o.setName("formule").setDescription("ex. 1d20+5, 2d20kh1").setRequired(true)),
].map((c) => c.toJSON());

interface VoiceSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: MessageAudio[];
}

const voiceSessions = new Map<string, VoiceSession>(); // par serveur Discord
const warnedUsers = new Map<string, number>();
let client: Client | null = null;

export async function startDiscordBot() {
  if (!discordEnv.botToken) return;
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] connecté en tant que ${c.user.tag}`);
    for (const guild of c.guilds.cache.values()) await registerCommands(guild);
    await rejoinSavedVoiceChannels();
  });
  client.on(Events.GuildCreate, registerCommands);
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await handleCommand(interaction);
    } catch (e) {
      const content = `Erreur : ${(e as Error).message}`;
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  });
  client.on(Events.MessageCreate, (message) => {
    handleDiscordMessage(message).catch((e) => console.warn("[discord] message :", (e as Error).message));
  });

  messageListeners.push(relayToDiscord);
  await client.login(discordEnv.botToken);
}

async function registerCommands(guild: Guild) {
  // Commandes par serveur : elles apparaissent tout de suite (les commandes globales mettent du temps).
  await guild.commands.set(commands).catch((e) => console.warn(`[discord] commandes sur ${guild.name} :`, e.message));
}

/** Utilisateur de l'appli correspondant à un compte Discord (connecté au moins une fois via Discord). */
async function appUserId(discordId: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.discordId, discordId));
  return row?.id ?? null;
}

async function campaignForGuild(guildId: string) {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.discordGuildId, guildId));
  return row ?? null;
}

async function handleCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ content: "Ces commandes marchent dans un serveur, pas en message privé.", flags: MessageFlags.Ephemeral });
  const userId = await appUserId(interaction.user.id);
  const notLinked = `Connecte-toi d'abord une fois sur la table avec Discord : ${env.appUrl}`;

  if (interaction.commandName === "r") {
    const campaign = await campaignForGuild(guild.id);
    if (!campaign) return interaction.reply({ content: "Aucune campagne liée à ce serveur (/mj lier).", flags: MessageFlags.Ephemeral });
    const me = userId && (await loadMember(campaign.id, userId));
    if (!me) return interaction.reply({ content: userId ? "Tu n'es pas membre de cette campagne." : notLinked, flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: "🎲", flags: MessageFlags.Ephemeral });
    await handleChatInput(campaign.id, me, `/r ${interaction.options.getString("formule", true)}`);
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === "lier") {
    if (!userId) return interaction.reply({ content: notLinked, flags: MessageFlags.Ephemeral });
    const code = interaction.options.getString("code", true).trim();
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.inviteCode, code));
    const me = campaign && (await loadMember(campaign.id, userId));
    if (!campaign || !me) return interaction.reply({ content: "Code inconnu, ou tu n'es pas membre de cette campagne.", flags: MessageFlags.Ephemeral });
    if (me.role !== "gm") return interaction.reply({ content: "Seul le MJ de la campagne peut la lier.", flags: MessageFlags.Ephemeral });
    // Un serveur Discord = une campagne liée à la fois.
    await db
      .update(campaigns)
      .set({ discordGuildId: null, discordTextChannelId: null, discordVoiceChannelId: null })
      .where(eq(campaigns.discordGuildId, guild.id));
    const voice = (interaction.member as GuildMember).voice.channel;
    await db
      .update(campaigns)
      .set({ discordGuildId: guild.id, discordTextChannelId: interaction.channelId, discordVoiceChannelId: voice?.id ?? null })
      .where(eq(campaigns.id, campaign.id));
    if (voice) await joinVoice(guild, voice.id);
    return interaction.reply(
      `Ce salon est lié à la campagne **${campaign.name}**. Les messages d'ici partent à la table, et la narration arrive ici.` +
        (voice ? ` Je lis les répliques dans 🔊 ${voice.name}.` : " Rejoins un salon vocal puis tape /mj rejoindre pour que je parle."),
    );
  }

  const campaign = await campaignForGuild(guild.id);
  if (!campaign) return interaction.reply({ content: "Aucune campagne liée à ce serveur. Le MJ tape /mj lier code:<code d'invitation>.", flags: MessageFlags.Ephemeral });

  if (sub === "statut") {
    const voice = voiceSessions.has(guild.id) ? "je suis dans le salon vocal" : "je ne suis pas en vocal";
    return interaction.reply({ content: `Campagne liée : **${campaign.name}** (salon <#${campaign.discordTextChannelId}>, ${voice}).`, flags: MessageFlags.Ephemeral });
  }

  const me = userId && (await loadMember(campaign.id, userId));
  if (!me) return interaction.reply({ content: userId ? "Tu n'es pas membre de cette campagne." : notLinked, flags: MessageFlags.Ephemeral });

  if (sub === "rejoindre") {
    const voice = (interaction.member as GuildMember).voice.channel;
    if (!voice) return interaction.reply({ content: "Rejoins d'abord un salon vocal.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    await db.update(campaigns).set({ discordVoiceChannelId: voice.id }).where(eq(campaigns.id, campaign.id));
    await joinVoice(guild, voice.id);
    return interaction.editReply(`Je suis dans 🔊 ${voice.name} : je lirai la narration et les répliques des PNJ.`);
  }
  if (sub === "quitter") {
    leaveVoice(guild.id);
    await db.update(campaigns).set({ discordVoiceChannelId: null }).where(eq(campaigns.id, campaign.id));
    return interaction.reply("Je quitte le salon vocal.");
  }
  if (sub === "delier") {
    if (me.role !== "gm") return interaction.reply({ content: "Seul le MJ peut délier la campagne.", flags: MessageFlags.Ephemeral });
    leaveVoice(guild.id);
    await db
      .update(campaigns)
      .set({ discordGuildId: null, discordTextChannelId: null, discordVoiceChannelId: null })
      .where(eq(campaigns.id, campaign.id));
    return interaction.reply(`Ce serveur n'est plus lié à **${campaign.name}**.`);
  }
}

/** Message tapé dans le salon textuel lié : il part au chat de la table au nom du joueur. */
async function handleDiscordMessage(message: Message) {
  if (message.author.bot || !message.guildId || !message.content.trim()) return;
  const campaign = await campaignForGuild(message.guildId);
  if (!campaign || campaign.discordTextChannelId !== message.channelId) return;
  const userId = await appUserId(message.author.id);
  const me = userId && (await loadMember(campaign.id, userId));
  if (!me) {
    // Un seul rappel par heure et par personne.
    const last = warnedUsers.get(message.author.id) ?? 0;
    if (Date.now() - last > 3600_000) {
      warnedUsers.set(message.author.id, Date.now());
      await message.reply(`Pour jouer, connecte-toi une fois sur la table avec Discord et rejoins la campagne : ${env.appUrl}`);
    }
    return;
  }
  try {
    await handleChatInput(campaign.id, me, message.content, "discord");
  } catch (e) {
    await message.reply((e as Error).message);
  }
}

/** Nouveau message à la table : on l'envoie sur Discord s'il est public. */
async function relayToDiscord(campaignId: string, message: ChatMessage, source: "web" | "discord" | "ai") {
  if (!client?.isReady() || message.visibility !== "all") return;
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), isNotNull(campaigns.discordGuildId)));
  if (!campaign?.discordGuildId) return;

  // Le message tapé sur Discord y est déjà : on ne le renvoie pas.
  if (source !== "discord" && campaign.discordTextChannelId) {
    const channel = await client.channels.fetch(campaign.discordTextChannelId).catch(() => null);
    if (channel?.type === ChannelType.GuildText) await channel.send(formatForDiscord(message)).catch(() => {});
  }
  if (message.audio) enqueueVoice(campaign.discordGuildId, message.audio);
}

async function joinVoice(guild: Guild, channelId: string) {
  leaveVoice(guild.id);
  const connection = joinVoiceChannel({
    channelId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  const player = createAudioPlayer();
  connection.subscribe(player);
  const session: VoiceSession = { connection, player, queue: [] };
  player.on(AudioPlayerStatus.Idle, () => void playNext(session));
  player.on("error", (e) => console.warn("[discord] lecture :", e.message));
  voiceSessions.set(guild.id, session);
}

function leaveVoice(guildId: string) {
  const session = voiceSessions.get(guildId);
  if (!session) return;
  session.player.stop(true);
  session.connection.destroy();
  voiceSessions.delete(guildId);
}

function enqueueVoice(guildId: string, audio: MessageAudio) {
  const session = voiceSessions.get(guildId);
  if (!session) return;
  session.queue.push(audio);
  if (session.player.state.status === AudioPlayerStatus.Idle) void playNext(session);
}

async function playNext(session: VoiceSession) {
  const next = session.queue.shift();
  if (!next) return;
  try {
    // audio.url = /uploads/tts/<campagne>/<fichier>.wav
    const file = join(env.uploadDir, next.url.replace(/^\/uploads\//, ""));
    const pcm = toDiscordPcm(parseWav(await readFile(file)), next.pitchCents, next.volume);
    session.player.play(createAudioResource(Readable.from([pcm]), { inputType: StreamType.Raw }));
  } catch (e) {
    console.warn("[discord] réplique illisible :", (e as Error).message);
    void playNext(session);
  }
}

/** Après un redémarrage, le bot retourne dans les salons vocaux enregistrés. */
async function rejoinSavedVoiceChannels() {
  const linked = await db.select().from(campaigns).where(isNotNull(campaigns.discordVoiceChannelId));
  for (const c of linked) {
    const guild = c.discordGuildId ? client?.guilds.cache.get(c.discordGuildId) : undefined;
    if (guild && c.discordVoiceChannelId) {
      await joinVoice(guild, c.discordVoiceChannelId).catch((e) => console.warn(`[discord] retour en vocal (${guild.name}) :`, e.message));
    }
  }
}
