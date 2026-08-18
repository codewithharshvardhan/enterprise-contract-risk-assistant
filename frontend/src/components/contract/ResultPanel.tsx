import { useEffect, useState } from 'react'
import {
  fetchReview,
  updateReviewMetadata,
  setRiskDecision as apiSetRiskDecision,
  addReviewComment,
  setFinalDecision as apiSetFinalDecision,
} from '../../lib/api'
import {
  CLAUSE_CATEGORIES,
  type ContractMetadata,
  type PipelineResult,
  type Recommendation,
  type ReviewState,
} from '../../types/contract'

interface Props {
  result: PipelineResult | null
  contractId: string
  error?: string | null
}

const recommendationStyles: Record<Recommendation, { bg: string; text: string; border: string }> = {
  READY_FOR_REVIEW: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300' },
  MINOR_REVISIONS_RECOMMENDED: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-300' },
  LEGAL_REVIEW_REQUIRED: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-300' },
  PROCUREMENT_REVIEW_REQUIRED: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  HIGH_RISK_IMMEDIATE_REVIEW: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' },
  REQUEST_MISSING_INFORMATION: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-300' },
}

const severityStyles: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
}

const riskColor = (score: number): string => {
  if (score <= 2) return 'bg-green-500'
  if (score <= 3.5) return 'bg-yellow-500'
  return 'bg-red-500'
}

function RiskBar({ label, score, max = 5 }: { label: string; score: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 text-xs text-gray-600">{label}</div>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${riskColor(max === 1 ? score * 5 : score)}`} style={{ width: `${(score / max) * 100}%` }} />
      </div>
      <div className="w-10 text-xs font-semibold text-right text-gray-700">{max === 1 ? `${Math.round(score * 100)}%` : score}</div>
    </div>
  )
}

function labelize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const METADATA_FIELDS: Array<keyof ContractMetadata> = [
  'title', 'agreement_type', 'effective_date', 'expiration_date', 'renewal_date', 'duration',
  'governing_law', 'jurisdiction', 'payment_terms', 'payment_schedule', 'currency', 'contract_value',
  'notice_period', 'termination_conditions', 'renewal_conditions', 'confidentiality_requirements',
  'ip_ownership', 'deliverables', 'service_levels',
]

export default function ResultPanel({ result, contractId, error }: Props) {
  const [review, setReview] = useState<ReviewState | null>(null)
  const [draft, setDraft] = useState<Partial<ContractMetadata>>({})
  const [commentText, setCommentText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setReview(null)
    setDraft({})
    setCommentText('')
    if (!contractId || !result) return
    void fetchReview(contractId).then((view) => {
      setReview(view.review)
      setDraft(view.review.editedMetadata)
    })
  }, [contractId, result])

  if (error && !result) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="text-sm font-semibold text-red-700 mb-1">Analysis Failed</div>
        <div className="text-xs text-red-600">{error}</div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-400">
        Run an analysis to see results here.
      </div>
    )
  }

  const recStyle = recommendationStyles[result.recommendation] ?? recommendationStyles.READY_FOR_REVIEW
  const mergedMetadata: Record<string, string> = { ...result.metadata, ...draft } as unknown as Record<string, string>

  async function saveField(field: keyof ContractMetadata, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }))
    if (!contractId) return
    const updated = await updateReviewMetadata(contractId, { [field]: value })
    setReview(updated)
  }

  async function decideRisk(riskId: string, decision: 'accepted' | 'rejected') {
    if (!contractId) return
    setBusy(true)
    try {
      const updated = await apiSetRiskDecision(contractId, riskId, decision)
      setReview(updated)
    } finally {
      setBusy(false)
    }
  }

  async function postComment() {
    if (!contractId || !commentText.trim()) return
    setBusy(true)
    try {
      const updated = await addReviewComment(contractId, commentText.trim())
      setReview(updated)
      setCommentText('')
    } finally {
      setBusy(false)
    }
  }

  async function finalize(decision: 'approved' | 'rejected' | 'needs_revision') {
    if (!contractId) return
    setBusy(true)
    try {
      const updated = await apiSetFinalDecision(contractId, decision)
      setReview(updated)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Recommendation */}
      <div className={`rounded-xl border-2 p-4 ${recStyle.bg} ${recStyle.border}`}>
        <div className="text-xs font-medium text-gray-500 mb-1">Recommendation</div>
        <div className={`text-xl font-black ${recStyle.text}`}>{result.recommendation.replace(/_/g, ' ')}</div>
        <div className={`text-xs mt-1 ${recStyle.text} opacity-80`}>{result.contract_status.replace('_', ' ').toUpperCase()}</div>
      </div>

      {/* Confidence */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Confidence</div>
        <div className="flex flex-col gap-2">
          <RiskBar label="Extraction" score={result.confidence.extraction} max={1} />
          <RiskBar label="Clauses" score={result.confidence.clause_identification} max={1} />
          <RiskBar label="Risk Detection" score={result.confidence.risk_detection} max={1} />
          <RiskBar label="Summary" score={result.confidence.summary} max={1} />
          <div className="border-t border-gray-100 pt-2 mt-1">
            <RiskBar label="Overall" score={result.confidence.overall} max={1} />
          </div>
        </div>
      </div>

      {/* Risk Matrix */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Risk Matrix</div>
        <div className="flex flex-col gap-2">
          <RiskBar label="Commercial" score={result.risk_matrix.commercial} />
          <RiskBar label="Legal" score={result.risk_matrix.legal} />
          <RiskBar label="Operational" score={result.risk_matrix.operational} />
          <RiskBar label="Compliance" score={result.risk_matrix.compliance} />
          <div className="border-t border-gray-100 pt-2 mt-1">
            <RiskBar label="Overall Score" score={result.risk_matrix.overall_score} />
          </div>
        </div>
      </div>

      {/* Editable Metadata */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Metadata (editable)</div>
        <div className="mb-2 text-xs text-gray-800"><span className="text-gray-400">Parties: </span>{result.metadata.parties.join(', ') || '—'}</div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {METADATA_FIELDS.map((field) => (
            <div key={field}>
              <dt className="text-gray-400 mb-0.5">{labelize(field)}</dt>
              <input
                className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={mergedMetadata[field] ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                onBlur={(e) => void saveField(field, e.target.value)}
              />
            </div>
          ))}
        </dl>
      </div>

      {/* Clause grid */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Clauses</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {CLAUSE_CATEGORIES.map((cat) => {
            const found = result.clauses.find((c) => c.category === cat)
            const present = found?.present ?? false
            return (
              <div key={cat} className={`flex items-start gap-1.5 text-xs rounded-lg px-2 py-1 ${present ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-400'}`}>
                <span>{present ? '✓' : '—'}</span>
                <div>
                  <div className="font-medium">{cat}</div>
                  {found?.excerpt && <div className="text-[11px] opacity-70 line-clamp-2">{found.excerpt}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Obligations */}
      {result.obligations.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Obligations</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="font-medium pb-1">Party</th>
                <th className="font-medium pb-1">Category</th>
                <th className="font-medium pb-1">Description</th>
              </tr>
            </thead>
            <tbody>
              {result.obligations.map((o, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1 pr-2 text-gray-700 whitespace-nowrap">{o.party}</td>
                  <td className="py-1 pr-2 text-gray-500">{o.category}</td>
                  <td className="py-1 text-gray-700">{o.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Absence Flags */}
      {result.absence_flags.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Missing Clauses</div>
          <ul className="flex flex-col gap-1">
            {result.absence_flags.map((flag, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-amber-800">
                <span className="text-amber-500">⚠</span>{flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Risk Findings</div>
        <div className="flex flex-col gap-2">
          {result.risks.map((risk) => {
            const decision = review?.riskDecisions[risk.id]
            return (
              <div key={risk.id} className="rounded-lg border border-gray-100 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${severityStyles[risk.severity]}`}>{risk.severity}</span>
                    <span className="text-xs font-semibold text-gray-800">{risk.title}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decideRisk(risk.id, 'accepted')}
                      className={`text-[11px] px-2 py-1 rounded-md border ${decision === 'accepted' ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decideRisk(risk.id, 'rejected')}
                      className={`text-[11px] px-2 py-1 rounded-md border ${decision === 'rejected' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      Reject
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{risk.category}{risk.related_clause ? ` · ${risk.related_clause}` : ''}</div>
                <div className="text-xs text-gray-600 mt-1">{risk.explanation}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Executive Summary */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Executive Summary</div>
        <p className="text-xs text-gray-700 mb-3 leading-relaxed">{result.summary.narrative}</p>
        <dl className="grid grid-cols-1 gap-1.5 text-xs">
          {(Object.entries(result.summary) as Array<[string, string]>)
            .filter(([key]) => key !== 'narrative')
            .map(([key, value]) => (
              <div key={key}><dt className="text-gray-400 inline">{labelize(key)}: </dt><dd className="text-gray-800 inline">{value || '—'}</dd></div>
            ))}
        </dl>
      </div>

      {/* Comments */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Reviewer Comments</div>
        {review && review.comments.length > 0 && (
          <ul className="flex flex-col gap-1.5 mb-2">
            {review.comments.map((c) => (
              <li key={c.id} className="text-xs text-gray-700 bg-gray-50 rounded-lg px-2 py-1.5">
                {c.text}
                <span className="text-[10px] text-gray-400 ml-2">{new Date(c.ts).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void postComment() }}
          />
          <button type="button" disabled={busy || !commentText.trim()} onClick={() => void postComment()} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      {/* Final decision */}
      <div className="rounded-xl border border-gray-100 bg-white p-3">
        <div className="text-xs font-medium text-gray-500 mb-2">
          Final Decision {review?.finalDecision && <span className="font-semibold text-gray-700">— {review.finalDecision.replace('_', ' ')}</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'approved' as const, label: 'Approve', style: 'bg-green-600 border-green-600 text-white' },
            { value: 'needs_revision' as const, label: 'Needs Revision', style: 'bg-yellow-500 border-yellow-500 text-white' },
            { value: 'rejected' as const, label: 'Reject', style: 'bg-red-600 border-red-600 text-white' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={busy}
              onClick={() => void finalize(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${review?.finalDecision === opt.value ? opt.style : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
