import { Link, useParams } from 'react-router-dom'
import { products } from '../data/catalog'

export default function ProductDetailPage() {
  const { slug } = useParams()
  const product = products.find((item) => item.slug === slug)

  if (!product) {
    return <p className="text-gray-600">Produit introuvable.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        <p className="text-gray-500 mt-1">{product.summary}</p>
      </div>

      <div className="card">
        <div className="card-body grid md:grid-cols-2 gap-4 text-sm">
          <p><strong>Catégorie :</strong> {product.category}</p>
          <p><strong>Livrable :</strong> {product.delivery}</p>
          <p><strong>Disponibilité :</strong> {product.availability}</p>
          <p><strong>Commande :</strong> Sur devis (pas d’achat en ligne)</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Ce qui est inclus</h2></div>
        <div className="card-body">
          <ul className="list-disc ml-5 space-y-2 text-sm text-gray-700">
            {product.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-body flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">Ce service se contractualise avec un accompagnement humain. Vous pouvez demander une étude adaptée.</p>
          <a href="mailto:contact@twoine.com" className="btn btn-primary">Demander un devis</a>
        </div>
      </div>

      <Link to="/produits" className="btn btn-secondary">Retour aux produits</Link>
    </div>
  )
}
