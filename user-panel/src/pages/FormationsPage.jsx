import { Link } from 'react-router-dom'
import { formations } from '../data/catalog'

export default function FormationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Formations</h1>
        <p className="text-gray-500 mt-1">Catalogue des formations techniques proposées actuellement.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {formations.map((formation) => (
          <article key={formation.slug} className="card">
            <div className="card-body space-y-3">
              <span className="badge badge-info">{formation.level}</span>
              <h2 className="font-semibold text-gray-900">{formation.title}</h2>
              <p className="text-sm text-gray-600">{formation.description}</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><strong>Durée :</strong> {formation.duration}</li>
                <li><strong>Format :</strong> {formation.format}</li>
                <li><strong>Public :</strong> {formation.audience}</li>
              </ul>
              <Link to={`/formations/${formation.slug}`} className="btn btn-secondary w-full justify-center">
                Voir la description complète
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
