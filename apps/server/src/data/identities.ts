// Explicit spelling/nickname aliases only. Nation remains part of the identity.
const aliases: Record<string, string> = {
  mahendrasinghdhoni: "msdhoni",
  matthewshort: "mattshort",
  mattkuhnemann: "matthewkuhnemann",
  mitchowen: "mitchellowen",
  mitchmarsh: "mitchellmarsh",
  mitchswepson: "mitchellswepson",
  stevensmith: "stevesmith",
  ajtye: "andrewtye",
  mattfisher: "matthewfisher",
  olliedavies: "oliverdavies",
  nathanedward: "nathenedward",
  nathanedwards: "nathenedward",
  abdulraheemtoppin: "abdulrahmantoppin",
  joshualittle: "joshlittle",
  mohammedshami: "mohammadshami",
  rakheemcornwall: "rahkeemcornwall",
  akeemauguste: "ackeemauguste",
  mattgilkes: "matthewgilkes",
  danielworrall: "danworrall",
  sufyanmoqim: "sufiyanmuqeem",
  mattyrevis: "matthewrevis",
  kunwarjitsingh: "kunwarjeetsingh",
  ottnielbaartman: "ottneilbaartman",
  samuelcook: "samcook",
  dilonpennington: "dillonpennington",
  ramakrishnagosh: "ramakrishnaghosh",
  noorahmed: "noorahmad",
  sheryasgopal: "shreyasgopal",
  matheesapathirana: "matheeshapathirana",
  tirpuranavijay: "tripuranavijay",
  maipallomror: "mahipallomror",
  saisudharshan: "saisudharsan",
  shahbazahamad: "shahbazahmed",
  ntilakvarma: "tilakvarma",
  mitchsantner: "mitchellsantner",
  vaibhavsuryavanshi: "vaibhavsooryavanshi",
  luhandrepretorius: "lhuandrepretorius",
  aniketvarma: "aniketverma",
  henrichklaasen: "heinrichklaasen",
  eshanmallinga: "eshanmalinga",
};
export function playerIdentity(name: string, nation: string) {
  const normalized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${aliases[normalized] ?? normalized}|${nation.toLowerCase().trim()}`;
}

export const renamedTeams: Record<string, Record<string, string>> = {
  hundred: {
    "Manchester Originals Men": "Manchester Super Giants Men",
    "Oval Invincibles Men": "MI London Men",
    "Northern Superchargers Men": "SunRisers Leeds Men",
  },
  cpl: { "Barbados Royals": "Barbados Tridents" },
};
