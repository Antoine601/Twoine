import { Link, useParams } from 'react-router-dom'
import { formations } from '../data/catalog'

export default function FormationDetailPage() {
  const { slug } = useParams()
  const formation = formations.find((item) => item.slug === slug)

  if (!formation) {
    return <p className="text-gray-600">Formation introuvable.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{formation.title}</h1>
        <p className="text-gray-500 mt-1">{formation.description}</p>
      </div>

      <div className="card">
        <div className="card-body grid md:grid-cols-2 gap-4 text-sm">
          <p><strong>Niveau :</strong> {formation.level}</p>
          <p><strong>Durée :</strong> {formation.duration}</p>
          <p><strong>Format :</strong> {formation.format}</p>
          <p><strong>Public concerné :</strong> {formation.audience}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Objectifs pédagogiques</h2></div>
        <div className="card-body">
          <ul className="list-disc ml-5 space-y-2 text-sm text-gray-700">
            {formation.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-body flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">La réservation en ligne n’est pas disponible. Contactez l’équipe pour planifier cette formation.</p>
          <a href="mailto:contact@twoine.com" className="btn btn-primary">Contacter l’équipe</a>
        </div>
      </div>

      <Link to="/formations" className="btn btn-secondary">Retour aux formations</Link>
    </div>
  )
}
