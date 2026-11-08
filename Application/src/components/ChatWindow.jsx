import { ArrowLeft, ImagePlus, Send, MoreHorizontal, Smile, Paperclip, X, Check, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'

export default function ChatWindow({ chat, sendMessage, back }) {
  const [text,setText]=useState(''), [image,setImage]=useState(null)
  const fileRef=useRef(null), bottomRef=useRef(null)
  useEffect(()=>bottomRef.current?.scrollIntoView({behavior:'smooth'}),[chat?.messages.length])
  if(!chat) return <main className="conversation welcome-screen"><div className="welcome-art"><MessageIcon/></div><h2>Une conversation qui commence ?</h2><p>Choisissez une discussion et retrouvez vos messages ici.</p><span>Vos messages sont enregistrés sur cet appareil</span></main>
  const submit=e=>{e.preventDefault();if(!text.trim()&&!image)return;sendMessage(chat.id,text.trim(),image);setText('');setImage(null)}
  const onFile=e=>{const file=e.target.files?.[0];if(file){const reader=new FileReader();reader.onload=()=>setImage(reader.result);reader.readAsDataURL(file)}e.target.value=''}
  return <main className="conversation"><header className="conversation-header"><button className="icon-button back-button" onClick={back} aria-label="Retour"><ArrowLeft size={21}/></button><Avatar src={chat.avatar} name={chat.name} online/><span className="contact-meta"><b>{chat.name}</b><small>{chat.group?chat.subtitle:'en ligne'}</small></span><button className="icon-button more-button"><MoreHorizontal size={22}/></button></header>
    <div className="messages-area"><div className="day-separator"><span>Aujourd’hui</span></div>{chat.messages.map((m,i)=><div key={m.id} className={`message-line ${m.mine?'mine':''}`}><div className="bubble">{m.image&&<img className="message-image" src={m.image} alt="Image envoyée"/>}{m.text&&<p>{m.text}</p>}<span className="message-time">{m.time}{m.mine&&(i===chat.messages.length-1?<CheckCheck size={14}/>:<Check size={14}/>)}</span></div></div>)}<div ref={bottomRef}/></div>
    <form className="composer" onSubmit={submit}>{image&&<div className="image-preview"><img src={image} alt="Aperçu"/><button type="button" onClick={()=>setImage(null)}><X size={14}/></button></div>}<button type="button" className="attach-button" onClick={()=>fileRef.current?.click()} aria-label="Joindre une image"><Paperclip size={19}/></button><input ref={fileRef} hidden type="file" accept="image/*" onChange={onFile}/><input className="message-input" placeholder="Écrire un message..." value={text} onChange={e=>setText(e.target.value)}/><button type="button" className="emoji-button" aria-label="Emoji"><Smile size={19}/></button><button type="submit" className="send-button" aria-label="Envoyer"><Send size={18}/></button></form>
  </main>
}
function MessageIcon(){return <div className="chat-bubbles"><span>Salut !</span><span>👋</span></div>}
