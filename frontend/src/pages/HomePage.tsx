import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-80px)] flex items-center justify-center overflow-hidden bg-slate-950">
      
      {/* Animated Background Orbs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-indigo-500 rounded-full mix-blend-screen filter blur-2xl opacity-30 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-screen filter blur-2xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-screen filter blur-2xl opacity-30 animate-blob animation-delay-4000"></div>

      {/* Floating Themed Icons */}
      <div className="absolute top-1/4 left-10 text-6xl select-none pointer-events-none opacity-10 animate-float-slow">📄</div>
      <div className="absolute top-1/3 right-16 text-7xl select-none pointer-events-none opacity-10 animate-float-medium">🛡️</div>
      <div className="absolute bottom-1/4 left-16 text-5xl select-none pointer-events-none opacity-10 animate-float-fast">⚖️</div>
      <div className="absolute bottom-1/3 right-20 text-6xl select-none pointer-events-none opacity-10 animate-float-slow">✍️</div>
      <div className="absolute top-12 left-1/3 text-4xl select-none pointer-events-none opacity-10 animate-float-medium">⚠️</div>
      <div className="absolute bottom-12 right-1/3 text-5xl select-none pointer-events-none opacity-10 animate-float-fast">✅</div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
            <span className="text-sm font-medium text-indigo-300">Powered by Enterprise AI</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tight">
            Enterprise Contract <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              Risk Workflow
            </span>
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            An advanced multi-stage AI workflow that extracts critical legal facts, evaluates risk across multiple dimensions, and delivers structured, actionable contract insights.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            { icon: '🔍', title: 'Extractor', desc: 'Identifies metadata, core clauses, and missing enterprise terms' },
            { icon: '⚖️', title: 'Risk Evaluator', desc: 'Scores commercial, legal, operational & compliance risk 1–5' },
            { icon: '{}', title: 'JSON Formatter', desc: 'Guarantees valid, schema-compliant JSON output with retries' },
          ].map((card) => (
            <div 
              key={card.title} 
              className="group relative rounded-2xl border border-slate-700 bg-slate-800/90 backdrop-blur-xl p-8 hover:bg-slate-800 hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
              <div className="relative z-10">
                <div className="text-4xl mb-4 transform group-hover:scale-110 transition-transform origin-left">{card.icon}</div>
                <div className="text-xl font-bold text-white mb-2">{card.title}</div>
                <div className="text-slate-300 leading-relaxed">{card.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <Link
            to="/analyze"
            className="group relative inline-flex items-center justify-center bg-indigo-500 text-white rounded-xl py-4 px-10 text-lg font-semibold overflow-hidden transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/30"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="relative z-10 flex items-center gap-2">
              Start Analysis
              <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
            </span>
          </Link>
          <Link
            to="/executions"
            className="group inline-flex items-center justify-center bg-white/5 border border-white/10 text-white rounded-xl py-4 px-10 text-lg font-semibold hover:bg-white/10 transition-all backdrop-blur-md"
          >
            <span className="flex items-center gap-2">
              View Executions
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
