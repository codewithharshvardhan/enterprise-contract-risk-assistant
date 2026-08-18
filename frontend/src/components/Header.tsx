import { Link, NavLink } from 'react-router-dom'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link 
          to="/" 
          className="group text-xl font-extrabold tracking-tight transition-transform duration-100 hover:scale-102 active:scale-98"
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500">
            Contract Risk Workflow
          </span>
        </Link>
        <nav className="flex items-center gap-3">
          <NavLink
            to="/analyze"
            className={({ isActive }) =>
              `relative px-4 py-2 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150 active:scale-95 ${
                isActive 
                  ? 'bg-indigo-50/80 text-indigo-600 border border-indigo-100/80 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
              }`
            }
          >
            Analyze
          </NavLink>
          <NavLink
            to="/executions"
            className={({ isActive }) =>
              `relative px-4 py-2 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150 active:scale-95 ${
                isActive 
                  ? 'bg-indigo-50/80 text-indigo-600 border border-indigo-100/80 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
              }`
            }
          >
            Executions
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
