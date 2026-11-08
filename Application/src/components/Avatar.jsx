export default function Avatar({ src, name, size='md', online=false }) {
  return <span className={`avatar avatar-${size}`}><img src={src} alt={name} loading="lazy"/>{online && <i className="online-dot"/>}</span>
}
