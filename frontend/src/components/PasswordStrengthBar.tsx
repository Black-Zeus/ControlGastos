import { cn } from '@/lib/utils'

export function pwdStrength(pwd: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pwd) return { score: 0, label: '' }
  let s = 0
  if (pwd.length >= 8) s++
  if (pwd.length >= 12) s++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++
  if (/\d/.test(pwd)) s++
  if (/[^A-Za-z0-9]/.test(pwd)) s++
  const score = Math.min(s, 4) as 0 | 1 | 2 | 3 | 4
  return { score, label: ['', 'Muy débil', 'Débil', 'Regular', 'Fuerte'][score] }
}

export function PasswordStrengthBar({ password }: { password: string }) {
  const { score, label } = pwdStrength(password)
  const color     = score <= 1 ? 'bg-red-400' : score === 2 ? 'bg-orange-400' : score === 3 ? 'bg-yellow-400' : 'bg-green-500'
  const textColor = score <= 1 ? 'text-red-500' : score === 2 ? 'text-orange-500' : score === 3 ? 'text-yellow-600' : 'text-green-600'
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-all duration-300',
              i <= score ? color : 'bg-gray-100 dark:bg-slate-700',
            )}
          />
        ))}
      </div>
      {label && <p className={cn('text-[11px] font-medium', textColor)}>{label}</p>}
    </div>
  )
}
