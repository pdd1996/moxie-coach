import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * 设置页分组卡：图标标题 + 可选右上角 badge + 可选「恢复默认」按钮。
 * 「恢复默认」按钮 hover 时出现，未传 onReset 时不渲染。
 */
export interface SectionCardProps {
  icon: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode // 标题下方的说明文字
  badge?: React.ReactNode // 标题右侧的小标记（如「已启用」）
  onReset?: () => void // 传了就显示 ↺ 默认按钮
  className?: string
  children: React.ReactNode
}

export function SectionCard({
  icon,
  title,
  description,
  badge,
  onReset,
  className,
  children,
}: SectionCardProps) {
  return (
    <Card className={cn('group/section', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
          <CardTitle className="flex items-center gap-2 text-base">
            {title}
            {badge}
          </CardTitle>
          {onReset && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onReset}
              className="ml-auto opacity-0 transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100"
              aria-label="恢复默认"
            >
              <RotateCcw className="size-3" />
              恢复默认
            </Button>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  )
}
