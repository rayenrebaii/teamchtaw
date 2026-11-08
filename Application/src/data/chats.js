const people = [
  ['maya','Maya Ben Ali','Maya','https://i.pravatar.cc/120?img=47','Tu as vu les photos du week-end ?','10:42',2],
  ['adam','Adam Trabelsi','Adam','https://i.pravatar.cc/120?img=12','Parfait, on se retrouve là-bas !','09:18',0],
  ['ines','Inès Khelifi','Inès','https://i.pravatar.cc/120?img=44','vocal · 0:24','Hier',1],
  ['youssef','Youssef Mansour','Youssef','https://i.pravatar.cc/120?img=11','Merci beaucoup 🙌','Hier',0],
  ['sarah','Sarah Gharbi','Sarah','https://i.pravatar.cc/120?img=49','Je te partage ça demain','Lun.',0],
  ['nour','Nour Ben Salem','Nour','https://i.pravatar.cc/120?img=45','Ça marche, à très vite !','Lun.',0],
  ['amine','Amine Jaziri','Amine','https://i.pravatar.cc/120?img=13','Tu gères ✨','Dim.',0],
  ['lina','Lina Haddad','Lina','https://i.pravatar.cc/120?img=48','Bonne soirée !','Sam.',0],
  ['weekend','Les amis du week-end','Groupe · 8 membres','https://i.pravatar.cc/120?img=33','Maya : on réserve pour 20h ?','10:12',3],
  ['design','Studio créatif','Groupe · 12 membres','https://i.pravatar.cc/120?img=25','Adam : nouvelle maquette dispo','Hier',0],
  ['famille','La famille ❤️','Groupe · 6 membres','https://i.pravatar.cc/120?img=5','Inès : bisous à tous !','Dim.',0],
]
const hello = (name, text, time, mine=false) => ({ id: crypto.randomUUID(), text, time, mine })
export const initialChats = people.map(([id,name,subtitle,avatar,last,time,unread], i) => ({ id,name,subtitle,avatar,unread,group:i>7,messages:[hello(name, i===0?'Coucou ! Tu es toujours partante pour samedi ?':i===8?'Hello tout le monde ! On se retrouve ce week-end ?':`Salut ${name.split(' ')[0]} ! Comment se passe ta journée ?`,'09:24'),hello(name,last,time,i===0||i===1)] }))
