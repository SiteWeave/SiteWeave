import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import ProjectDetailsView from './ProjectDetailsView'

export default function ProjectWorkspaceView({ routeTab = 'tasks' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()

  React.useEffect(() => {
    if (!id) return
    if (String(state.selectedProjectId) !== String(id)) {
      dispatch({ type: 'SET_PROJECT', payload: id })
    }
    if (state.activeView !== 'Projects') {
      dispatch({ type: 'SET_VIEW', payload: 'Projects' })
    }
  }, [id, state.selectedProjectId, state.activeView, dispatch])

  React.useEffect(() => {
    if (!id || state.isLoading) return
    const projectExists = state.projects.some((project) => String(project.id) === String(id))
    if (!projectExists) {
      dispatch({ type: 'SET_PROJECT', payload: null })
      navigate('/projects', { replace: true })
    }
  }, [id, state.isLoading, state.projects, dispatch, navigate])

  return (
    <ProjectDetailsView
      routeTab={routeTab}
      onTabChange={(nextTab) => navigate(`/projects/${id}/${nextTab}`)}
    />
  )
}
