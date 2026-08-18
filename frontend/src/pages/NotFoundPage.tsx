import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="max-w-3xl mx-auto px-4 py-16 text-center">
      <p className="text-8xl font-bold text-gray-200 mb-4">404</p>
      <h1 className="text-2xl font-semibold text-gray-700 mb-4">Page not found</h1>
      <p className="text-gray-500 mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
      >
        Back to home
      </Link>
    </section>
  )
}
