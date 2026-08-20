import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { StoreProvider } from '@/lib/store'
import Dashboard from '@/pages/Dashboard'
import Progress from '@/pages/Progress'
import ProblemList from '@/pages/ProblemList'
import ProblemView from '@/pages/ProblemView'
import Settings from '@/pages/Settings'

// 切题（/problem/88 → /problem/27）时用 key={id} 强制 ProblemView 整组件 remount，
// 让其 useState（phase/lang/code/note…）按新题重置，避免带着上一题的代码/笔记。
function ProblemViewByKey() {
  const { id } = useParams()
  return <ProblemView key={id} />
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="progress" element={<Progress />} />
            <Route path="problems" element={<ProblemList />} />
            <Route path="problem/:id" element={<ProblemViewByKey />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}