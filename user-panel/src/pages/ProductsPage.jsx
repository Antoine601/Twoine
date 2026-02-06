import { Link } from 'react-router-dom'
import { products } from '../data/catalog'

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Produits & Services</h1>
        <p className="text-gray-500 mt-1">Offres techniques réellement proposées pour renforcer vos opérations.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article key={product.slug} className="card">
            <div className="card-body space-y-3">
              <span className="badge badge-gray">{product.category}</span>
              <h2 className="font-semibold text-gray-900">{product.name}</h2>
              <p className="text-sm text-gray-600">{product.summary}</p>
              <div className="text-sm text-gray-700 space-y-1">
                <p><strong>Livrable :</strong> {product.delivery}</p>
                <p><strong>Disponibilité :</strong> {product.availability}</p>
              </div>
              <Link to={`/produits/${product.slug}`} className="btn btn-secondary w-full justify-center">Voir le détail</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
