const timeline = [
  { year: '2022', title: 'Création de Twoine', text: 'Lancement de la plateforme avec un objectif clair: simplifier la gestion technique des sites.' },
  { year: '2023', title: 'Structuration multi-sites', text: 'Ajout des outils d’administration pour services, fichiers, bases de données et domaines.' },
  { year: '2024', title: 'Montée en fiabilité', text: 'Amélioration du monitoring, de la sécurité et de l’expérience de gestion au quotidien.' },
  { year: '2025', title: 'Accompagnement clients', text: 'Développement des offres de formation et d’accompagnement opérationnel.' },
]

const team = [
  { name: 'Sarah M.', role: 'Direction produit', mission: 'Aligne les besoins utilisateurs avec les évolutions de la plateforme.' },
  { name: 'Léo B.', role: 'Lead infrastructure', mission: 'Pilote la fiabilité, la sécurité et la qualité d’hébergement.' },
  { name: 'Nora T.', role: 'Customer success', mission: 'Accompagne les équipes clientes dans l’adoption des bonnes pratiques.' },
]

export default function AboutPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">À propos</h1>
        <p className="text-gray-500 mt-1">Twoine accompagne les équipes qui veulent héberger, maintenir et faire évoluer leurs services web avec méthode.</p>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900">Équipe</h2>
        </div>
        <div className="card-body grid gap-4 md:grid-cols-3">
          {team.map((member) => (
            <article key={member.name} className="p-4 rounded-lg border border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-900">{member.name}</h3>
              <p className="text-sm text-primary-700 mt-1">{member.role}</p>
              <p className="text-sm text-gray-600 mt-2">{member.mission}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900">Frise chronologique</h2>
        </div>
        <div className="card-body">
          <ol className="space-y-4">
            {timeline.map((step) => (
              <li key={step.year} className="flex gap-4">
                <div className="w-20 text-sm font-semibold text-primary-700">{step.year}</div>
                <div className="flex-1 pb-4 border-b border-gray-100 last:border-0">
                  <h3 className="font-medium text-gray-900">{step.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  )
}
