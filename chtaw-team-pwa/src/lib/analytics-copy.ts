export const analyticsEnglish: Record<string, string> = Object.fromEntries(`
CHTAW TEAM · ANALYSES|CHTAW TEAM · ANALYTICS
Tableau de bord|Dashboard
Analyses|Analytics
Les chiffres pour accompagner votre collectif.|The numbers behind your community.
Filtres du tableau de bord|Dashboard filters
Période|Period
Cette semaine|This week
Ce mois|This month
Trois derniers mois|Last three months
Cette année|This year
Période personnalisée|Custom period
Appliquer|Apply
Chargement de la période…|Loading period…
La période filtre les inscriptions et les séances terminées, selon leur premier créneau. Les effectifs et les groupes sont actuels. Les signalements portent sur tout l’historique.|The period filters registrations and completed sessions by their first slot. Account and group counts are current. Alerts cover the full history.
Indicateurs clés|Key indicators
Utilisateurs actuels|Current users
Groupes actuels|Current groups
Effectifs actuels|Current counts
Sur la période|Selected period
{approved} approuvés · {pending} en attente|{approved} approved · {pending} pending
Groupe sélectionné|Selected group
Séances effectuées|Completed sessions
Toutes les fins de créneau sont passées|All session slots have ended
Présences enregistrées|Recorded attendances
Un étudiant présent à une séance = une présence|One student present at one session = one attendance
Taux de présence global|Overall attendance rate
{present} présences · {absent} absences confirmées|{present} present · {absent} confirmed absent
En attente des données|Awaiting data
Évolution des inscriptions|Registration trends
Regrouper les inscriptions|Group registrations
Par jour|By day
Par semaine|By week
Par mois|By month
Le filtre de groupe utilise les membres actuels, sans historique d’adhésion.|The group filter uses current members; membership history is unavailable.
Mode des inscriptions|Registration mode
Nouvelles|New
Cumulées|Cumulative
Comptes conservés, selon leur date réelle d’inscription. Le cumul inclut les dates antérieures à la période. Les comptes définitivement supprimés ne peuvent pas être reconstitués.|Retained accounts, by actual registration date. Cumulative totals include earlier registrations. Permanently deleted accounts cannot be reconstructed.
Courbe des inscriptions : utilisez les flèches pour parcourir les valeurs.|Registration chart: use arrow keys to explore values.
Total cumulé des comptes conservés|Cumulative retained accounts
Nouvelles inscriptions|New registrations
comptes cumulés|cumulative accounts
inscription(s)|registration(s)
Aucune inscription sur cette période.|No registrations during this period.
Présences par groupe|Attendance by group
{count} groupe(s)|{count} group(s)
Absences confirmées|Confirmed absences
Cliquez sur un groupe pour filtrer les analyses. Une séance partagée et ses participations figurent dans chaque groupe lié : ces totaux ne s’additionnent pas.|Select a group to filter the analyses. Shared sessions and their participants appear in every linked group: these totals cannot be added together.
Aucun groupe dans ce périmètre.|No groups in this scope.
Présences par séance|Attendance by session
{count} séance(s)|{count} session(s)
Séances terminées uniquement. Cliquez pour ouvrir le détail de présence.|Completed sessions only. Select one to view attendance details.
Aucune séance terminée sur cette période.|No completed sessions during this period.
Le taux = présences ÷ (présences + absences confirmées). Un vote ne vaut pas présence. Les pointages incomplets sont exclus du taux.|Rate = present ÷ (present + confirmed absent). A vote is not attendance. Incomplete records are excluded from the rate.
{count} pointage(s) incomplet(s) sur la période.|{count} incomplete attendance record(s) during this period.
Signalements actifs|Active alerts
Seuil existant de trois absences par organisateur, sur tout l’historique. Seul le filtre de groupe s’applique à cette liste.|Existing threshold of three absences per organizer, over the full history. Only the group filter applies to this list.
Groupes concernés|Groups concerned
Suivi par {name}|Tracked by {name}
Aucun signalement actif dans ce périmètre.|No active alerts in this scope.
Étudiants actuels|Current students
Participations établies|Finalized attendances
Pointages incomplets|Incomplete records
Taux de présence|Attendance rate
Pagination|Pagination
Choisissez une date de début et de fin valides.|Choose valid start and end dates.
La période est invalide.|The period is invalid.
La période ne peut pas dépasser cinq ans.|The period cannot exceed five years.
`.trim().split("\n").map(line => line.split("|")));
