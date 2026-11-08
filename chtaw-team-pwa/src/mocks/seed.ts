import type { DemoData, User } from "@/types";
export const GENERAL = "general";
const names = [
  "Yassine Ben Salem",
  "Amine Trabelsi",
  "Sarah Mansour",
  "Ahmed Ben Ali",
  "Nour Gharbi",
  "Mehdi Jaziri",
  "Ines Bouazizi",
  "Aziz Chaabane",
  "Mariem Saidi",
  "Omar Hamdi",
  "Lina Ayari",
  "Fares Khelifi",
  "Rania Zidi",
  "Walid Toumi",
  "Sonia Abidi",
  "Sami Dridi",
  "Salma Nasri",
  "Anis Kacem",
  "Aya Belhaj",
];
export function seed(): DemoData {
  const users: User[] = names.map((name, i) => ({
    id: `u${i}`,
    firstName: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" "),
    email:
      i === 0
        ? "admin@chtaw.demo"
        : i === 1
          ? "membre@chtaw.demo"
          : i === 13
            ? "attente@chtaw.demo"
            : i === 17
              ? "refuse@chtaw.demo"
              : `${name.split(" ")[0].toLowerCase()}@chtaw.demo`,
    role: i === 0 ? "ADMIN" : "USER",
    status: i < 13 ? "APPROVED" : i < 17 ? "PENDING" : "REJECTED",
    joinedAt: `2026-10-${String(10 + i).padStart(2, "0")}T10:00:00Z`,
    bio:
      i === 0
        ? "Ensemble, on va plus loin. Coach & fondateur."
        : "Sport, bonne humeur et esprit d’équipe.",
  }));
  const groups = [
    {
      id: GENERAL,
      name: "Team Chtaw — Général",
      description:
        "Le point de rencontre de toute la team. On partage, on se motive, on avance ensemble.",
      color: "#e9d5ff",
      isGeneral: true,
      memberIds: users.filter((u) => u.status === "APPROVED").map((u) => u.id),
    },
    {
      id: "running",
      name: "Running Club",
      description:
        "Les kilomètres passent mieux ensemble. Rendez-vous pour notre prochaine sortie !",
      color: "#ffc999",
      isGeneral: false,
      memberIds: ["u0", "u1", "u2", "u3", "u4", "u5"],
    },
    {
      id: "training",
      name: "Training Squad",
      description: "Objectifs, entraînements et petites victoires du quotidien.",
      color: "#d7c5f7",
      isGeneral: false,
      memberIds: ["u0", "u1", "u6", "u7", "u8"],
    },
    {
      id: "weekend",
      name: "Les sorties du week-end",
      description: "Une équipe, de nouvelles aventures. Préparons la prochaine sortie.",
      color: "#a8dce6",
      isGeneral: false,
      memberIds: ["u0", "u2", "u9", "u10", "u11", "u12"],
    },
  ];
  const messages = groups.flatMap((g, i) => [
    {
      id: `${g.id}-0`,
      groupId: g.id,
      authorId: "u0",
      kind: "system" as const,
      text: "Bienvenue dans votre espace d’équipe",
      createdAt: "2026-11-03T08:00:00Z",
    },
    {
      id: `${g.id}-1`,
      groupId: g.id,
      authorId: "u0",
      kind: "text" as const,
      text: [
        "Hello la team ! Prêts à bouger cette semaine ? 💪\nOn se retrouve ici pour partager toutes les infos et garder la motivation.",
        "La sortie de samedi se prépare ! Qui est partant pour 8 km au bord de la mer ? 🏃",
        "Nouvelle semaine, nouveaux objectifs ! On se retrouve à 18h pour la séance.",
        "Une randonnée à Zaghouan ce week-end, ça vous tente ? 🌿",
      ][i],
      createdAt: "2026-11-03T08:30:00Z",
    },
    {
      id: `${g.id}-2`,
      groupId: g.id,
      authorId: g.memberIds[2],
      kind: "text" as const,
      text: "Toujours partante ! Ça fait du bien de se retrouver et de progresser ensemble 🙌",
      createdAt: "2026-11-03T08:32:00Z",
    },
    {
      id: `${g.id}-3`,
      groupId: g.id,
      authorId: g.memberIds[1],
      kind: "text" as const,
      text: "Compte sur moi ! La motivation est au rendez-vous 🔥",
      createdAt: "2026-11-03T08:34:00Z",
    },
    {
      id: `${g.id}-4`,
      groupId: g.id,
      authorId: "u0",
      kind: "photo" as const,
      text: "Un petit souvenir de notre dernière sortie. Quelle équipe !",
      photoUrl: "/images/team.svg",
      createdAt: "2026-11-03T08:36:00Z",
    },
    {
      id: `${g.id}-5`,
      groupId: g.id,
      authorId: "u0",
      kind: "poll" as const,
      text: "",
      pollId: `poll-${g.id}`,
      createdAt: "2026-11-03T08:40:00Z",
    },
  ]);
  const polls = groups.map((g) => ({
    id: `poll-${g.id}`,
    groupId: g.id,
    authorId: "u0",
    question: "Quel créneau pour notre prochaine séance ?",
    options: [
      { id: "a", label: "Samedi matin · 08h00 ☀️" },
      { id: "b", label: "Samedi après-midi · 16h00" },
      { id: "c", label: "Dimanche matin · 09h00 🌿" },
    ],
    singleChoice: true,
    votes: [
      { userId: g.memberIds[2], optionIds: ["a"] },
      { userId: g.memberIds[3], optionIds: ["a"] },
      { userId: g.memberIds[4], optionIds: ["c"] },
    ],
  }));
  return { users, groups, messages, polls };
}
