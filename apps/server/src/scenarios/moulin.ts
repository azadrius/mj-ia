import type { Dnd5eSheet } from "@mj-ia/shared";

/**
 * « Le moulin de Brumevent » : scénario de test pour 1 joueur, niveau 2, environ 1 h.
 * Il sert à essayer la table, le MJ IA, les voix des PNJ (émotions variées),
 * les secrets du journal et les jetons cachés.
 */

type Visibility = "gm" | "all";
type SheetSeed = { key: string; name: string; data: Dnd5eSheet; pc?: boolean };
type TokenSeed = { name: string; x: number; y: number; color: string; sheet?: string; hidden?: boolean; pc?: boolean };
type SceneSeed = { key: string; name: string; map: string; width: number; height: number; tokens: TokenSeed[] };
type JournalSeed = {
  kind: "place" | "npc" | "quest" | "handout" | "session" | "note";
  title: string;
  content: string;
  gmNotes?: string;
  visibility: Visibility;
};

export interface Scenario {
  id: string;
  name: string;
  summary: string;
  activeScene: string;
  sheets: SheetSeed[];
  scenes: SceneSeed[];
  journal: JournalSeed[];
}

const npc = (race: string, ac: number, hp: number, abilities: Dnd5eSheet["abilities"], notes: string, kind: Dnd5eSheet["kind"] = "npc"): Dnd5eSheet => ({
  kind,
  race,
  class: "",
  level: 0,
  ac,
  speed: 30,
  hp: { current: hp, max: hp },
  abilities,
  notes,
});

const goblin = (role: string): Dnd5eSheet =>
  npc(
    "Gobelin",
    15,
    7,
    { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    `${role}. Cimeterre +4, 1d6+2 tranchant ; arc court +4, 1d6+2 perforant (80 pieds). Fuite agile : se désengager ou se cacher en action bonus. Fuit à 2 PV ou moins.`,
    "monster",
  );

export const moulinDeBrumevent: Scenario = {
  id: "moulin",
  name: "Le moulin de Brumevent (test solo)",
  summary: "Un meunier a disparu, et son moulin tourne la nuit sans un souffle de vent.",
  activeScene: "village",
  sheets: [
    {
      key: "joran",
      pc: true,
      name: "Joran Ventefort",
      data: {
        kind: "pc",
        race: "Humain",
        class: "Guerrier",
        level: 2,
        ac: 18,
        speed: 30,
        hp: { current: 20, max: 20 },
        abilities: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 10 },
        notes: [
          "Ancien garde de caravane, de passage à Saulnes. Maîtrise +2.",
          "Épée longue : +5 au toucher, 1d8+5 tranchant (style Duel). Arbalète légère : +4, 1d8+2 perforant (80/320 pieds), 20 carreaux.",
          "Second souffle (1 fois par repos court) : action bonus, regagne 1d10+2 PV.",
          "Fougue (1 fois par repos court) : une action de plus pendant ton tour.",
          "Compétences : Athlétisme +5, Perception +3, Intimidation +2, Survie +3.",
          "Cotte de mailles, bouclier, sac (corde 15 m, torches ×5, rations ×3, outre), 12 po.",
        ].join("\n"),
      },
    },
    { key: "hortense", name: "Mère Hortense", data: npc("Humaine", 10, 6, { str: 9, dex: 10, con: 11, int: 12, wis: 14, cha: 13 }, "Aubergiste du Chaudron, cousine d'Aldric. Inquiète, chaleureuse, parle vite quand elle a peur.") },
    { key: "bastien", name: "Bastien", data: npc("Humain", 11, 5, { str: 10, dex: 13, con: 10, int: 10, wis: 9, cha: 11 }, "Garçon meunier, 16 ans. Nerveux, ment mal (Perspicacité DD 10 pour voir qu'il cache quelque chose).") },
    { key: "aldric", name: "Aldric le meunier", data: npc("Humain", 10, 4, { str: 13, dex: 9, con: 12, int: 11, wis: 12, cha: 10 }, "Prisonnier dans la cave, épuisé (4 PV sur 9). Bourru mais juste.") },
    {
      key: "skrell",
      name: "Skrell",
      data: npc(
        "Gobelin (chef)",
        16,
        15,
        { str: 10, dex: 14, con: 10, int: 11, wis: 8, cha: 12 },
        "Chef de la bande. Cimeterre +4, 1d6+2 (deux attaques par tour, la seconde avec désavantage). Redirection : quand une attaque le touche, il peut la faire subir à un gobelin à 5 pieds (réaction). Lâche et beau parleur : négocie, ment, s'enfuit par le tunnel à 5 PV ou moins.",
        "monster",
      ),
    },
    { key: "gob1", name: "Gobelin guetteur", data: goblin("Guetteur du rez-de-chaussée, somnole près des meules") },
    { key: "gob2", name: "Gobelin meuleur", data: goblin("Moud la pierre-lune dans la cave") },
    { key: "gob3", name: "Gobelin du tunnel", data: goblin("Garde le tunnel vers la rivière ; sonne l'alarme avec une casserole") },
  ],
  scenes: [
    {
      key: "village",
      name: "Saulnes, la place du village",
      map: "saulnes.svg",
      width: 16,
      height: 12,
      tokens: [
        { name: "Joran", x: 8, y: 9, color: "#2e86de", sheet: "joran", pc: true },
        { name: "Mère Hortense", x: 4, y: 5, color: "#e67e22", sheet: "hortense" },
        { name: "Bastien", x: 11, y: 6, color: "#16a085", sheet: "bastien" },
      ],
    },
    {
      key: "moulin",
      name: "Le moulin de Brumevent",
      map: "moulin.svg",
      width: 20,
      height: 14,
      tokens: [
        { name: "Joran", x: 4, y: 11, color: "#2e86de", sheet: "joran", pc: true },
        { name: "Gobelin guetteur", x: 6, y: 6, color: "#27ae60", sheet: "gob1", hidden: true },
        { name: "Gobelin meuleur", x: 14, y: 5, color: "#27ae60", sheet: "gob2", hidden: true },
        { name: "Gobelin du tunnel", x: 17, y: 9, color: "#27ae60", sheet: "gob3", hidden: true },
        { name: "Skrell", x: 15, y: 3, color: "#8e44ad", sheet: "skrell", hidden: true },
        { name: "Aldric", x: 17, y: 2, color: "#7f8c8d", sheet: "aldric", hidden: true },
      ],
    },
  ],
  journal: [
    {
      kind: "quest",
      title: "Le meunier a disparu",
      visibility: "all",
      content:
        "Aldric, le meunier de Saulnes, n'a plus été vu depuis trois jours. Depuis, son moulin de Brumevent tourne la nuit alors qu'il n'y a pas un souffle de vent. Mère Hortense, l'aubergiste, offre 25 pièces d'or à qui le ramènera.",
    },
    {
      kind: "place",
      title: "Saulnes",
      visibility: "all",
      content: "Hameau de pêcheurs et de paysans au bord de la Brume. Une place, un puits, l'auberge du Chaudron. Le moulin est à dix minutes à pied, en amont, à l'est.",
    },
    {
      kind: "place",
      title: "Le moulin de Brumevent",
      visibility: "all",
      content: "Moulin à eau de pierre et de bois. La roue grince. Une odeur de farine… et autre chose, comme du métal chaud.",
      gmNotes:
        "La porte est entrouverte. Au rez-de-chaussée, un gobelin guetteur somnole (Discrétion du joueur contre sa Perception passive 9). Une trappe mène par une échelle à la cave, où les gobelins moulent un éclat de pierre-lune violette : la poudre sert à leur chamane, au loin. Le tunnel de la cave débouche sur la rivière : c'est par là que les gobelins sont entrés, et par là que Skrell fuit.",
    },
    {
      kind: "npc",
      title: "Mère Hortense",
      visibility: "all",
      content: "Aubergiste du Chaudron, ronde et vive, toujours un torchon sur l'épaule. Cousine d'Aldric.",
      gmNotes: "Elle a entendu des rires aigus près du moulin, la nuit. Elle soupçonne Bastien d'en savoir plus, mais n'ose pas l'accuser. Voix : inquiète (peur), puis soulagée (joie) si Aldric revient.",
    },
    {
      kind: "npc",
      title: "Bastien",
      visibility: "all",
      content: "Garçon meunier de seize ans, mains pleines d'ampoules, regard fuyant.",
      gmNotes:
        "Il doit 10 pièces d'argent aux gobelins, perdues aux osselets avec Skrell. Pour effacer sa dette, il leur a montré le tunnel de la cave. Il ne voulait pas qu'Aldric soit pris. S'il est rassuré ou intimidé (DD 12), il avoue en pleurant (tristesse) et révèle le tunnel et le nom de Skrell. Voix : nerveuse (peur), puis honteuse (tristesse).",
    },
    {
      kind: "npc",
      title: "Skrell",
      visibility: "gm",
      content:
        "Chef gobelin, petit, rusé, couvert de bijoux en cuivre volés. Il parle un commun approximatif et adore se moquer (moquerie). Il menace (menace) quand il se sent fort, supplie quand il est blessé. Il accepte de partir avec la pierre-lune si on le laisse filer et qu'on lui donne 10 po, et relâche alors Aldric.",
    },
    {
      kind: "npc",
      title: "Aldric le meunier",
      visibility: "all",
      content: "Meunier bourru d'une cinquantaine d'années, barbe blanche de farine.",
      gmNotes: "Enfermé dans une cage en osier dans la cave, épuisé. Libéré, il remercie d'une voix brisée (tristesse puis joie) et pardonne à Bastien si le joueur plaide pour lui.",
    },
    {
      kind: "note",
      title: "Déroulé du scénario (MJ)",
      visibility: "gm",
      content: [
        "Scénario solo pour un guerrier de niveau 2, environ une heure. Ton : aventure légère, un peu de peur, beaucoup d'humour avec Skrell.",
        "",
        "1. Ouverture (scène Saulnes). Le soir tombe sur la place. Mère Hortense aborde Joran devant l'auberge et lui raconte la disparition. Bastien rôde près du puits. Le joueur peut interroger les deux.",
        "2. Le moulin (passer à la scène Le moulin de Brumevent quand Joran s'y rend). Révéler chaque gobelin quand Joran le voit (rendre le jeton visible). Le guetteur peut être surpris, assommé ou interrogé.",
        "3. La cave. Skrell, le meuleur et Aldric en cage. Laisser le joueur choisir : combat, intimidation, négociation ou ruse. Le gobelin du tunnel arrive en renfort au deuxième round si l'alarme est donnée.",
        "4. Fin. Retour à l'auberge : 25 po d'Hortense. Si Bastien a été protégé, Aldric le garde comme apprenti. Si Skrell a fui avec la pierre-lune, il pourra revenir plus tard.",
        "",
        "Équilibrage solo : jamais plus de deux gobelins à la fois contre Joran. Si Joran tombe à 0 PV, les gobelins l'enferment avec Aldric au lieu de le tuer, et la partie continue par une évasion.",
        "Voix : faire parler chaque PNJ avec say et une émotion adaptée, pour tester les voix : Hortense (peur, joie), Bastien (peur, tristesse), Skrell (moquerie, menace, peur), Aldric (tristesse, joie), le narrateur (mystère dans le moulin, solennel à la fin).",
        "Jets : demander au joueur de lancer ses dés lui-même (/r 1d20+5). Les jets des gobelins sont faits par le MJ.",
      ].join("\n"),
    },
  ],
};

export const SCENARIOS: Record<string, Scenario> = { [moulinDeBrumevent.id]: moulinDeBrumevent };
