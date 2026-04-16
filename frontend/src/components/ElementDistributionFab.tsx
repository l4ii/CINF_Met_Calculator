/**
 * 悬浮按钮：点击展开元素分布表浮层（用于产物计算、热平衡计算页）
 */
import { useState } from 'react'
import ElementDistributionPanel from './ElementDistributionPanel'

interface ElementDistributionFabProps {
  darkMode: boolean
}

export default function ElementDistributionFab({ darkMode }: ElementDistributionFabProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium transition-colors ${
          darkMode
            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600'
            : 'bg-white hover:bg-gray-50 text-gray-800 border border-gray-200'
        }`}
        title="查看元素分布"
      >
        <span>元素分布</span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ElementDistributionPanel
              darkMode={darkMode}
              asOverlay
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
