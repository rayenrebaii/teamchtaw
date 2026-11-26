export type SiteLanguage = "fr" | "en";
export const siteEnglish: Record<string, string> = {
  "Accueil": "Home", "Guide": "Guide", "Contact": "Contact", "Téléchargement": "Download",
  "Langue": "Language", "Menu": "Menu", "Fermer le menu": "Close menu", "Team Chtaw — Accueil": "Team Chtaw — Home",
  "Votre coach": "Your coach", "Un coach": "A coach", "dédié à": "focused on", "votre réussite": "your success",
  "Des années d'expérience dans la préparation aux examens physiques des concours et des écoles.": "Years of experience preparing students for the physical tests required by entrance exams and schools.",
  "L'application": "The app", "dans votre": "in your", "poche": "pocket",
  "Programmes personnalisés, chronomètre, suivi de progression et conseils — partout, tout le temps.": "Personal training plans, a timer, progress tracking and advice — wherever you are.",
  "Ce qu'elle offre": "What it offers", "Prépare.": "Prepare.", "Progresse.": "Improve.", "Réussis.": "Succeed.",
  "Vitesse, endurance, force et souplesse : chaque épreuve de votre examen travaillée pas à pas.": "Speed, endurance, strength and flexibility: prepare for every part of your physical exam, step by step.",
  "Obtenir l'application": "Get the app", "Lire le guide": "Read the guide", "Diapositive {number}": "Slide {number}", "Précédent": "Previous", "Suivant": "Next",
  "Téléchargez": "Install", "Touchez Téléchargement, puis confirmez l’installation dans votre navigateur.": "Select Download, then confirm installation in your browser.",
  "Inscrivez-vous": "Sign up", "Créez votre compte dans l'application en indiquant votre école.": "Create your account in the app and enter your school.",
  "Validation": "Approval", "Le coach vérifie et valide votre compte depuis l'application.": "Your coach reviews and approves your account in the app.",
  "Entraînez-vous": "Start training", "Une fois validé, accédez à vos programmes et commencez.": "Once approved, open your training plans and get started.",
  "Programmes par épreuve": "Plans for each test", "Course, sauts, pompes, gainage… adaptés aux barèmes de votre examen.": "Running, jumps, push-ups and core training, tailored to your exam’s scoring criteria.",
  "Chrono & séances guidées": "Timer & guided sessions", "Lancez une séance, suivez les consignes, laissez le chrono rythmer l'effort.": "Start a session, follow the instructions and let the timer guide your workout.",
  "Suivi de progression": "Progress tracking", "Enregistrez vos performances et visualisez votre évolution semaine après semaine.": "Record your results and see your progress week by week.",
  "Planning d'entraînement": "Training schedule", "Un calendrier jusqu'au jour J, avec rappels de séances.": "A schedule leading up to exam day, with session reminders.",
  "Échange avec le coach": "Talk to your coach", "Posez vos questions et recevez des conseils personnalisés.": "Ask questions and get advice tailored to you.",
  "Comment ça": "How it", "marche": "works", "Tout ce qu'il faut savoir pour commencer à vous entraîner avec le coach.": "Everything you need to start training with your coach.",
  "Réservée aux élèves du coach": "For the coach’s students",
  "L'application est destinée aux étudiants qui souhaitent s'entraîner avec ce coach. Lors de l'inscription dans l'application, vous devez obligatoirement": "The app is for students who want to train with this coach. When signing up in the app, you must",
  "indiquer votre école": "enter your school", "Télécharger l'application en 4 étapes": "Get the app in 4 steps", "Ce que contient l'application": "What’s inside the app", "Utiliser l'application au quotidien": "Your daily training companion",
  "Ouvrez votre séance du jour": "Open today’s session", "Depuis l'accueil, la séance prévue est mise en avant. Touchez « Démarrer ».": "Your planned session appears on the home screen. Tap Start.",
  "Suivez les consignes": "Follow the instructions", "Chaque exercice est expliqué avec durée, répétitions et temps de repos.": "Each exercise includes its duration, repetitions and rest periods.",
  "Notez vos résultats": "Record your results", "À la fin, saisissez vos performances : l'application calcule votre progression.": "Enter your results at the end and the app will track your progress.",
  "Un souci ou une question ?": "Need help or have a question?", "N'hésitez pas à nous contacter.": "Get in touch with us.", "Nous contacter": "Contact us",
  "Parlons": "Let’s talk", "entraînement": "training", "Écrivez au coach": "Email your coach",
  "Une question sur l'application ou votre préparation ? Cliquez ci-dessous : votre messagerie s'ouvrira avec l'adresse du coach déjà remplie.": "Have a question about the app or your training? Use the button below to open an email addressed to your coach.",
  "Question — Application Team Chtaw": "Question — Team Chtaw app", "Envoyer un e-mail": "Send an email", "Le contact du coach sera disponible prochainement.": "The coach’s contact details will be available soon.",
  "Obtenez": "Get", "l'application": "the app", "Installez l'application Team Chtaw": "Install the Team Chtaw app",
  "Cliquez sur Installer l’application, puis confirmez sur la page d’installation. Sur iPhone, utilisez Safari : Partager, puis Sur l’écran d’accueil.": "Select Install the app, then confirm on the installation page. On iPhone, use Safari: Share, then Add to Home Screen.",
  "Installer l'application": "Install the app", "Disponible sur Android et iPhone. Installation depuis votre navigateur.": "Available on Android and iPhone. Install directly from your browser.",
  "Installation indisponible : le lien public de l'application n'est pas encore configuré.": "Installation is unavailable: the public app link has not been configured yet.",
  "Préparation aux examens physiques": "Physical exam preparation",
  "Découvrez l'application Team Chtaw : programmes, suivi et coaching pour réussir vos examens physiques.": "Discover Team Chtaw: training plans, progress tracking and coaching to prepare for your physical exams.",
  "Programmes, suivi et coaching pour réussir vos examens physiques.": "Training plans, progress tracking and coaching for your physical exams.",
  "Page introuvable": "Page not found", "Cette page n’existe pas ou a été déplacée.": "This page does not exist or has been moved.", "Retour à l’accueil": "Back to home",
  "Cette page n’a pas pu être chargée": "This page could not be loaded", "Vous pouvez réessayer ou revenir à l’accueil.": "You can try again or return to the home page.", "Réessayer": "Try again",
};
export function translateSite(key: string, language: SiteLanguage, values: Record<string, string | number> = {}) {
  let text = language === "en" ? siteEnglish[key] ?? key : key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
export function localizedInstallUrl(value: string, language: SiteLanguage) {
  try { const url = new URL(value); if (url.protocol !== "https:") return ""; url.searchParams.set("lang", language); return url.href; }
  catch { return ""; }
}
