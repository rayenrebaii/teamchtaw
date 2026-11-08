import { Search, Plus, MessageCircle, Users, UserRound, X } from 'lucide-react'
import Avatar from './Avatar'

function ChatRow({ chat, active, open }) {
  const last = chat.messages.at(-1)
  return <button className={`chat-row ${active?'selected':''}`} onClick={()=>open(chat.id)}><Avatar src={chat.avatar} name={chat.name}/><span className="chat-row-copy"><span className="chat-row-top"><b>{chat.name}</b><time>{last?.time}</time></span><span className="chat-row-bottom"><span className="last-message">{last?.mine && 'Vous : '}{last?.image && '📷 Photo'}{last?.text}</span>{chat.unread>0&&<i className="unread">{chat.unread}</i>}</span></span></button>
}
export default function ChatList({ chats, activeId, openChat, section, setSection, search, setSearch, setCreating, user }) {
  const filtered=chats.filter(c=>(section==='groups'?c.group:!c.group)&&`${c.name} ${c.messages.at(-1)?.text}`.toLowerCase().includes(search.toLowerCase()))
  return <aside className="sidebar"><header className="sidebar-header"><div className="brand"><span className="brand-icon"><MessageCircle size={19}/></span><span>Chat<span>Flow</span></span></div><button className="icon-button create-button" title="Nouvelle conversation" onClick={()=>setCreating(true)}><Plus size={19}/></button></header>
    <div className="sidebar-title"><div><p className="eyebrow">VOTRE ESPACE</p><h1>{section==='groups'?'Groupes':'Messages'}</h1></div><button className="new-chat-mobile" onClick={()=>setCreating(true)}><Plus size={20}/></button></div>
    <label className="search-box"><Search size={17}/><input placeholder="Rechercher une conversation" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button onClick={()=>setSearch('')} aria-label="Effacer"><X size={15}/></button>}</label>
    <div className="list-caption">{section==='groups'?'VOS GROUPES':'RÉCENTS'} <span>{filtered.length}</span></div>
    <div className="chat-list">{filtered.map(c=><ChatRow key={c.id} chat={c} active={activeId===c.id} open={openChat}/>)}{filtered.length===0&&<div className="empty-search">Aucune conversation trouvée</div>}</div>
    <nav className="bottom-nav"><button className={section==='chats'?'nav-active':''} onClick={()=>setSection('chats')}><MessageCircle size={20}/><span>Discussions</span></button><button className={section==='groups'?'nav-active':''} onClick={()=>setSection('groups')}><Users size={20}/><span>Groupes</span></button><button className={section==='profile'?'nav-active':''} onClick={()=>setSection('profile')}><UserRound size={20}/><span>Profil</span></button></nav>
    <button className="account-strip" onClick={()=>setSection('profile')}><Avatar src={user.avatar} name={user.name} size="sm"/><span><b>{user.name}</b><small>Mon profil</small></span><span className="account-status">En ligne</span></button>
  </aside>
}
