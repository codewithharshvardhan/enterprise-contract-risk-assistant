import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useContractAnalysis } from '../hooks/useContractAnalysis'
import { fetchExecution } from '../lib/api'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas'
import ContractInputPanel from '../components/contract/ContractInputPanel'
import ResultPanel from '../components/contract/ResultPanel'
import type { ExecutionRecord } from '../types/contract'

export default function AnalyzePage() {
  const [contractText, setContractText] = useState('')
  const [searchParams] = useSearchParams()
  const { state, run, runFile, pipelineNodes } = useContractAnalysis()

  // Load a specific execution from URL ?id=
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) return
    void fetchExecution(id).then((ex) => {
      if (ex.rawTextExcerpt) setContractText(ex.rawTextExcerpt + '…')
    })
  }, [searchParams])

  const webhookUrl = `${window.location.origin.replace(/:\d+$/, '')}/proxy/service1/webhook`

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-slate-950">
      {/* Animated Background Orbs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-indigo-500 rounded-full mix-blend-screen filter blur-2xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-screen filter blur-2xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-screen filter blur-2xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Floating Themed Icons */}
      <div className="absolute top-1/4 left-10 text-6xl select-none pointer-events-none opacity-5 animate-float-slow">📄</div>
      <div className="absolute top-1/3 right-16 text-7xl select-none pointer-events-none opacity-5 animate-float-medium">🛡️</div>
      <div className="absolute bottom-1/4 left-16 text-5xl select-none pointer-events-none opacity-5 animate-float-fast">⚖️</div>

      <div className="relative z-10 max-w-screen-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Enterprise Contract Risk Workflow</h1>
          <p className="text-sm text-slate-400 mt-1">5-node AI pipeline — Extractor → Risk Evaluator → JSON Guardrail</p>
        </div>

        {/* Canvas (full width) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <WorkflowCanvas
            pipelineNodes={pipelineNodes}
            nodeStates={state.nodeStates}
            executionNodes={state.execution?.nodes ?? []}
            isRunning={state.isRunning}
          />
        </div>

        {/* Stacked layout: input on top, result below */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Contract Input</h2>
            <ContractInputPanel
              contractText={contractText}
              onChange={setContractText}
              onRun={() => void run(contractText)}
              onRunFile={(file) => void runFile(file)}
              isRunning={state.isRunning}
              webhookUrl={webhookUrl}
            />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Analysis Result</h2>
            <ResultPanel
              result={state.execution?.result ?? null}
              contractId={state.execution?.contractId ?? ''}
              error={state.error}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
