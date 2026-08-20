import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, ListChecks, Settings, Moon, Sun, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

const nav = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/problems', label: '题单', icon: ListChecks, end: false },
  { to: '/settings', label: '设置', icon: Settings, end: false },
]

export function Layout() {
  const { theme, toggle } = useTheme()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* 侧边栏 */}
      <aside className="flex w-16 flex-col items-center gap-1 border-r bg-card py-4 md:w-52 md:items-stretch md:px-3">
        <div className="mb-4 flex items-center justify-center gap-2 md:justify-start md:px-2">
          <GraduationCap className="size-6 text-emerald-600" />
          <span className="hidden text-sm font-bold md:inline">默写教练</span>
        </div>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:justify-start',
                isActive && 'bg-accent text-accent-foreground font-medium',
              )
            }
          >
            <Icon className="size-4.5" />
            <span className="hidden md:inline">{label}</span>
          </NavLink>
        ))}
      </aside>

      {/* 主内容 */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏：右侧放深浅色切换 */}
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-end border-b bg-card px-4">
          <Button variant="outline" size="icon" onClick={toggle} title="切换深浅色">
            {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </Button>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
