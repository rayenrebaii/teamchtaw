import { useState, useEffect } from 'react'
import { Plus, X, MessageCircle } from 'lucide-react'
import { initialChats } from './data/chats'
import { useLocalState } from './hooks/useLocalState'
import ChatList from './components/ChatList'
import ChatWindow from './components/ChatWindow'
import Profile from './pages/Profile'
import Avatar from './components/Avatar'

const user={name:'Alex Morgan',email:'alex.morgan@email.com',avatar:'https://i.pravatar.cc/120?img=68'}
export default function App(){
  const [chats,setChats]=useLocalState('chatflow-messages-v1',initialChats),[dark,setDark]=useLocalState('chatflow-dark-v1',false)
  const [activeId,setActiveId]=useState(null),[section,setSection]=useState('chats'),[search,setSearch]=useState(''),[creating,setCreating]=useState(false),[installPrompt,setInstallPrompt]=useState(null)
  useEffect(()=>{document.documentElement.classList.toggle('dark',dark)},[dark])
  useEffect(()=>{const handler=e=>{e.preventDefault();setInstallPrompt(e)};window.addEventListener('beforeinstallprompt',handler);return()=>window.removeEventListener('beforeinstallprompt',handler)},[])
  const active=chats.find(c=>c.id===activeId)
  const openChat=id=>{setActiveId(id);setSection('chats');setChats(cs=>cs.map(c=>c.id===id?{...c,unread:0}:c))}
  const sendMessage=(id,text,image)=>setChats(cs=>cs.map(c=>c.id!==id?c:{...c,unread:0,messages:[...c.messages,{id:crypto.randomUUID(),text,image,time:new Intl.DateTimeFormat('fr',{hour:'2-digit',minute:'2-digit'}).format(new Date()),mine:true}]}))
  const createChat=name=>{const c={id:crypto.randomUUID(),name,subtitle:name,avatar:`https://i.pravatar.cc/120?u=${encodeURIComponent(name)}`,unread:0,group:false,messages:[{id:crypto.randomUUID(),text:`Conversation créée avec ${name}`,time:'Maintenant',mine:false}]};setChats(cs=>[c,...cs]);setCreating(false);openChat(c.id)}
  const install=async()=>{if(installPrompt){await installPrompt.prompt();setInstallPrompt(null)}}
  const profile=section==='profile'
  return <div className="app-shell"><ChatList chats={chats} activeId={activeId} openChat={openChat} section={section==='groups'?'groups':'chats'} setSection={v=>{setSection(v);setActiveId(null)}} search={search} setSearch={setSearch} setCreating={setCreating} user={user}/>{profile?<Profile user={user} dark={dark} toggleTheme={()=>setDark(v=>!v)} installPrompt={installPrompt} install={install}/>:<div className={`main-pane ${active?'has-chat':''}`}><ChatWindow chat={active} sendMessage={sendMessage} back={()=>setActiveId(null)}/></div>}{creating&&<div className="modal-backdrop" onClick={()=>setCreating(false)}><form className="create-modal" onSubmit={e=>{e.preventDefault();const val=e.currentTarget.elements.name.value.trim();if(val)createChat(val)}} onClick={e=>e.stopPropagation()}><div className="modal-heading"><span className="setting-icon"><MessageCircle size={19}/></span><button type="button" className="icon-button" onClick={()=>setCreating(false)}><X size={19}/></button></div><h2>Nouvelle conversation</h2><p>Ajoutez une personne pour démarrer un échange.</p><label>Nom du contact<input autoFocus name="name" placeholder="Ex. Camille Dupont"/></label><button className="modal-submit"><Plus size={17}/> Créer la conversation</button></form></div>}</div>
}
