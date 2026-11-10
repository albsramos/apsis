import { useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'

/** The selection is the URL: /:factoryId is the factory, /:factoryId/carrier/:carrierId one carrier in it. */
export function useSelection() {
  const { factoryId = '', carrierId } = useParams()
  const navigate = useNavigate()
  const { search } = useLocation()
  const select = useCallback(
    (id: string | null) => navigate({ pathname: id ? `/${factoryId}/carrier/${encodeURIComponent(id)}` : `/${factoryId}`, search }),
    [navigate, factoryId, search],
  )
  const openFactory = useCallback((id: string) => navigate({ pathname: `/${id}`, search }), [navigate, search])
  return { factoryId, carrierId, select, openFactory }
}
