import type { NodeStatus } from '../../types/contract'

interface Props {
  fromStatus: NodeStatus
  toStatus: NodeStatus
}

export default function NodeConnector({ fromStatus }: Props) {
  const isActive = fromStatus === 'done' || fromStatus === 'running'
  return (
    <div className="flex-1 flex items-center self-center min-w-[16px] px-1">
      <div className={`h-0.5 flex-grow transition-colors duration-500 ${isActive ? 'bg-indigo-400' : 'bg-gray-200'}`} />
      <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0">
        <path d="M0 0 L8 4 L0 8 Z" fill={isActive ? '#818cf8' : '#d1d5db'} />
      </svg>
    </div>
  )
}
