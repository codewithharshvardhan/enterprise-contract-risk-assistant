interface Props {
  contractText: string
  onChange: (text: string) => void
  onRun: () => void
  onRunFile: (file: File) => void
  isRunning: boolean
  webhookUrl: string
}

const SAMPLE_CONTRACT = `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of January 1, 2025, between Acme Corp ("Service Provider") and Beta Industries ("Client").

1. GOVERNING LAW: This Agreement shall be governed by the laws of the State of Delaware.

2. TERM AND EXPIRATION: This Agreement commences January 1, 2025 and expires December 31, 2025.

3. LIABILITY: Service Provider's aggregate liability shall not exceed $100,000 USD.

4. INDEMNIFICATION: Each party shall indemnify and hold harmless the other party from claims arising from its own negligence (Mutual indemnification).

5. INTELLECTUAL PROPERTY: All work product created under this Agreement shall be owned by Client upon full payment.

6. DATA PRIVACY: Service Provider shall comply with applicable data protection laws including GDPR.

7. PAYMENT TERMS: Client shall pay invoices within 30 days of receipt.`

export default function ContractInputPanel({ contractText, onChange, onRun, onRunFile, isRunning, webhookUrl }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Contract Text</label>
        <textarea
          className="w-full h-64 rounded-xl border border-gray-200 bg-white p-3 text-sm font-mono text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Paste your contract text here…"
          value={contractText}
          onChange={(e) => onChange(e.target.value)}
          disabled={isRunning}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning || !contractText.trim()}
          className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 px-4 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? 'Analyzing…' : 'Run Analysis'}
        </button>
        <button
          type="button"
          onClick={() => onChange(SAMPLE_CONTRACT)}
          disabled={isRunning}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Sample
        </button>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Or upload a file</label>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={isRunning}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onRunFile(file)
            e.target.value = ''
          }}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
        />
        <p className="text-xs text-gray-400 mt-1">PDF, DOCX, or TXT — analysis starts immediately on selection.</p>
      </div>
      <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
        <div className="text-xs font-semibold text-gray-500 mb-1">Webhook URL</div>
        <div className="flex items-center gap-2">
          <code className="text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded flex-1 break-all">{webhookUrl}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(webhookUrl)}
            className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
          >
            Copy
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-1">POST <code>{'{"raw_text": "..."}'}</code> to trigger the pipeline</div>
      </div>
    </div>
  )
}
