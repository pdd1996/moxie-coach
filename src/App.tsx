import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { StoreProvider } from '@/lib/store'
import Dashboard from '@/pages/Dashboard'
import ProblemList from '@/pages/ProblemList'
import ProblemView from '@/pages/ProblemView'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="problems" element={<ProblemList />} />
            <Route path="problem/:id" element={<ProblemView />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}