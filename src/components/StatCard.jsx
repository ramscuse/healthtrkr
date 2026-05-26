import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function StatCard({ title, label, value, subtext, colorClass }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
        {label && <p className="text-xs text-muted-foreground mb-2">{label}</p>}
        <p className={cn('text-3xl font-bold', colorClass || 'text-foreground')}>{value}</p>
        {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  )
}
