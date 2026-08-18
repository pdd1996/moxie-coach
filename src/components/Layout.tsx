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
        <div className="mt-auto flex justify-center md:justify-start md:px-2">
          <Button variant="ghost" size="icon" onClick={toggle} title="切换深浅色">
            {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </Button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
