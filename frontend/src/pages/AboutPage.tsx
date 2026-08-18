export default function AboutPage() {
  return (
    <section className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">About this template</h1>
      <div className="prose prose-gray max-w-none space-y-4 text-gray-600 leading-relaxed">
        <p>
          This template gives you a clean starting point for a React SPA. Routing is handled by
          React Router v6, HTTP calls go through an Axios singleton configured from{' '}
          <code className="bg-gray-100 px-1 rounded text-sm font-mono">VITE_API_BASE_URL</code>,
          and the entire project is type-checked with TypeScript strict mode.
        </p>
        <p>
          Copy the template, run <code className="bg-gray-100 px-1 rounded text-sm font-mono">npm install</code>,
          update <code className="bg-gray-100 px-1 rounded text-sm font-mono">.env</code> with your
          API URL, and start building.
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>React 18 with concurrent features</li>
          <li>React Router v6 with nested layouts</li>
          <li>Axios with typed interceptors</li>
          <li>Tailwind CSS v3 with PostCSS</li>
          <li>Vitest for fast unit tests</li>
          <li>ESLint + Prettier pre-configured</li>
          <li>Docker multi-stage build (nginx production image)</li>
        </ul>
      </div>
    </section>
  )
}
