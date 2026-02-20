import { Link } from 'react-router-dom'

export function NotFoundRoute() {
  return (
    <div className="empty-state">
      <h2>Conversation Not Found</h2>
      <p>The link you followed does not match any server or local conversation.</p>
      <Link to="/" className="secondary">
        Go Home
      </Link>
    </div>
  )
}
