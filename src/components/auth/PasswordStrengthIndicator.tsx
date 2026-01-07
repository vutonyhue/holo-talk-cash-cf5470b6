import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
}

interface Requirement {
  label: string;
  met: boolean;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const requirements: Requirement[] = useMemo(() => [
    { label: 'Ít nhất 6 ký tự', met: password.length >= 6 },
    { label: 'Chứa chữ hoa (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Chứa chữ thường (a-z)', met: /[a-z]/.test(password) },
    { label: 'Chứa số (0-9)', met: /[0-9]/.test(password) },
    { label: 'Chứa ký tự đặc biệt (!@#$...)', met: /[^A-Za-z0-9]/.test(password) },
  ], [password]);

  const strength = useMemo(() => {
    const metCount = requirements.filter(r => r.met).length;
    if (metCount <= 1) return { level: 0, label: 'Rất yếu', color: 'bg-destructive' };
    if (metCount === 2) return { level: 1, label: 'Yếu', color: 'bg-orange-500' };
    if (metCount === 3) return { level: 2, label: 'Trung bình', color: 'bg-yellow-500' };
    if (metCount === 4) return { level: 3, label: 'Mạnh', color: 'bg-emerald-500' };
    return { level: 4, label: 'Rất mạnh', color: 'bg-emerald-600' };
  }, [requirements]);

  if (!password) return null;

  return (
    <div className="space-y-3 mt-2">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Độ mạnh:</span>
          <span className={`font-medium ${strength.level >= 3 ? 'text-emerald-600' : strength.level >= 2 ? 'text-yellow-600' : 'text-destructive'}`}>
            {strength.label}
          </span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= strength.level ? strength.color : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Requirements checklist */}
      <div className="grid grid-cols-1 gap-1">
        {requirements.map((req, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {req.met ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className={req.met ? 'text-emerald-600' : 'text-muted-foreground'}>
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
