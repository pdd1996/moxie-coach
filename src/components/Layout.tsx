import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ListChecks,
  Settings,
  Moon,
  Sun,
  GraduationCap,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

const nav = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/problems', label: '题单', icon: ListChecks, end: false },
  { to: '/settings', label: '设置', icon: Settings, end: false },
]

const STORAGE_KEY = 'moxie:sidebar:collapsed'

export function Layout() {
  const { theme, toggle } = useTheme()
  // 默认展开;从 localStorage 读取偏好
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* 侧边栏 */}
      <aside
        className={cn(
          'flex shrink-0 flex-col items-center gap-1 border-r bg-card py-4 transition-[width] duration-200 ease-out md:items-stretch md:px-3',
          collapsed ? 'w-16 md:w-16' : 'w-16 md:w-60',
        )}
      >
        {/* 品牌区 */}
        <div
          className={cn(
            'mb-6 flex items-center gap-1.5',
            collapsed ? 'flex-col' : 'md:flex-row md:items-center md:gap-2 md:px-2',
          )}
        >
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
            <GraduationCap className="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className={cn('flex-col leading-tight', collapsed ? 'hidden' : 'hidden md:flex')}>
            <span className="text-sm font-bold tracking-tight">默写教练</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="size-2.5" />
              陪你练到手热
            </span>
          </div>
        </div>

        {/* 导航分组标题 */}
        <div
          className={cn(
            'px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70',
            collapsed && 'hidden',
          )}
        >
          导航
        </div>

        {/* 导航条目 */}
        <nav className="flex w-full flex-col gap-0.5">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:justify-start md:px-3',
                  isActive && 'bg-accent font-medium text-accent-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* 激活态左侧高亮条 */}
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 hidden h-5 -translate-y-1/2 rounded-r-full bg-emerald-500 transition-all md:block',
                      isActive ? 'w-1 opacity-100' : 'w-0 opacity-0',
                    )}
                    aria-hidden
                  />
                  <Icon
                    className={cn(
                      'size-4 shrink-0 transition-colors',
                      isActive && 'text-emerald-600 dark:text-emerald-400',
                    )}
                  />
                  <span className={cn(collapsed ? 'hidden' : 'hidden md:inline')}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 底部:主题切换 + 折叠按钮 */}
        <div className="mt-auto flex w-full flex-col gap-1">
          <div
            className={cn(
              'mx-2 border-t pt-2',
              collapsed && 'mx-1',
            )}
          />
          <button
            onClick={toggle}
            title="切换深浅色"
            className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:justify-start md:px-3"
          >
            {theme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            <span className={cn(collapsed ? 'hidden' : 'hidden md:inline')}>
              {theme === 'dark' ? '浅色模式' : '深色模式'}
            </span>
          </button>
          {/* 折叠/展开按钮(归属侧边栏,跟侧边栏一起收缩) */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:justify-start md:px-3"
          >
            {collapsed ? (
              <PanelLeft className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
            <span className={cn(collapsed ? 'hidden' : 'hidden md:inline')}>
              收起侧边栏
            </span>
          </button>
          {/* 版本号(只在展开时显示) */}
          <div
            className={cn(
              'px-3 pt-2 text-[10px] text-muted-foreground/60',
              collapsed && 'hidden',
            )}
          >
            v0.1.0 · MVP
          </div>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏 */}
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-sm">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            专注当下 · 一题一练
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden md:inline-flex">
              反馈
            </Button>
            <Button variant="outline" size="icon" onClick={toggle} title="切换深浅色">
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
