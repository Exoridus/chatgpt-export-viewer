import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function DeepLinkRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const pending = sessionStorage.getItem('redirect')
    if (pending) {
      sessionStorage.removeItem('redirect')
      navigate(pending, { replace: true })
    }
  }, [navigate])
  return null
}
