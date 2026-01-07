import { useEffect, useRef, useCallback, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Loader2, User, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// Username validation regex (international standard)
const USERNAME_REGEX = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

interface UsernameRequirement {
  id: string;
  label: string;
  met: boolean;
}

interface UsernameInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (isValid: boolean, isAvailable: boolean | null) => void;
  disabled?: boolean;
  required?: boolean;
}

export function UsernameInput({ 
  value, 
  onChange, 
  onValidityChange,
  disabled = false,
  required = false 
}: UsernameInputProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checkedUsernamesRef = useRef<Map<string, boolean>>(new Map());

  // Normalize input
  const normalizedValue = value.trim().toLowerCase();
  const wasNormalized = value.trim() !== '' && normalizedValue !== value.trim();

  // Calculate requirements
  const getRequirements = useCallback((username: string): UsernameRequirement[] => {
    const normalized = username.trim().toLowerCase();
    
    return [
      {
        id: 'length',
        label: `3-20 ký tự (hiện tại: ${normalized.length})`,
        met: normalized.length >= MIN_LENGTH && normalized.length <= MAX_LENGTH,
      },
      {
        id: 'chars',
        label: 'Chỉ chữ thường, số và dấu gạch dưới (_)',
        met: normalized.length === 0 || /^[a-z0-9_]+$/.test(normalized),
      },
      {
        id: 'start',
        label: 'Bắt đầu bằng chữ cái hoặc số',
        met: normalized.length === 0 || /^[a-z0-9]/.test(normalized),
      },
      {
        id: 'end',
        label: 'Không kết thúc bằng dấu gạch dưới',
        met: normalized.length === 0 || !normalized.endsWith('_'),
      },
      {
        id: 'consecutive',
        label: 'Không có 2 dấu gạch dưới liên tiếp',
        met: normalized.length === 0 || !normalized.includes('__'),
      },
    ];
  }, []);

  // Validate format
  const isValid = normalizedValue.length >= MIN_LENGTH && 
                  normalizedValue.length <= MAX_LENGTH && 
                  USERNAME_REGEX.test(normalizedValue);

  // Check availability via edge function
  const checkAvailability = useCallback(async (username: string): Promise<boolean> => {
    // Check cache first
    if (checkedUsernamesRef.current.has(username)) {
      return checkedUsernamesRef.current.get(username)!;
    }

    try {
      const response = await fetch(
        `https://dgeadmmbkvcsgizsnbpi.supabase.co/functions/v1/check-username?u=${encodeURIComponent(username)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();
      const available = result.available === true;
      
      // Cache result
      checkedUsernamesRef.current.set(username, available);
      
      return available;
    } catch (error) {
      console.error('Error checking username availability:', error);
      return false;
    }
  }, []);

  // Effect to check availability when value changes
  useEffect(() => {
    // Reset availability when value changes
    setIsAvailable(null);
    
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only check availability if format is valid
    if (isValid && normalizedValue.length >= MIN_LENGTH) {
      setIsChecking(true);
      
      debounceTimerRef.current = setTimeout(async () => {
        const available = await checkAvailability(normalizedValue);
        setIsAvailable(available);
        setIsChecking(false);
      }, 400);
    } else {
      setIsChecking(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [normalizedValue, isValid, checkAvailability]);

  // Notify parent of validity changes
  useEffect(() => {
    onValidityChange?.(isValid, isAvailable);
  }, [isValid, isAvailable, onValidityChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // Determine status
  const showStatus = normalizedValue.length >= 3;
  const isFullyValid = isValid && isAvailable === true;
  const isTaken = isValid && isAvailable === false;

  const requirements = getRequirements(value);

  return (
    <div className="space-y-2">
      <Label htmlFor="username" className="flex items-center gap-1.5">
        <User className="w-4 h-4" />
        Username
      </Label>
      
      <div className="relative">
        <Input
          id="username"
          type="text"
          placeholder="vd: be_vu, camly_angel, fun_chat_01"
          value={value}
          onChange={handleChange}
          className={cn(
            "h-12 pr-10",
            isFullyValid && "border-green-500 focus-visible:ring-green-500",
            isTaken && "border-destructive focus-visible:ring-destructive",
            !isValid && normalizedValue.length > 0 && "border-destructive focus-visible:ring-destructive"
          )}
          disabled={disabled}
          required={required}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
        />
        
        {/* Status indicator */}
        {showStatus && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isChecking ? (
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            ) : isFullyValid ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : isTaken ? (
              <X className="w-5 h-5 text-destructive" />
            ) : !isValid ? (
              <X className="w-5 h-5 text-destructive" />
            ) : null}
          </div>
        )}
      </div>

      {/* Normalization notice */}
      {wasNormalized && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" />
          Đã chuyển thành chữ thường: <span className="font-mono text-primary">{normalizedValue}</span>
        </p>
      )}

      {/* Status message */}
      {showStatus && !isChecking && (
        <div className="text-sm">
          {isFullyValid && (
            <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <Check className="w-4 h-4" />
              Username khả dụng
            </p>
          )}
          {isTaken && (
            <p className="text-destructive flex items-center gap-1">
              <X className="w-4 h-4" />
              Username đã được sử dụng
            </p>
          )}
        </div>
      )}

      {isChecking && showStatus && (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang kiểm tra...
        </p>
      )}

      {/* Requirements checklist */}
      <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground mb-2">Yêu cầu:</p>
        {requirements.map((req) => (
          <div 
            key={req.id} 
            className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              normalizedValue.length === 0 
                ? "text-muted-foreground" 
                : req.met 
                  ? "text-green-600 dark:text-green-400" 
                  : "text-destructive"
            )}
          >
            {normalizedValue.length === 0 ? (
              <div className="w-4 h-4 rounded-full border border-muted-foreground/50" />
            ) : req.met ? (
              <Check className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4" />
            )}
            <span>{req.label}</span>
          </div>
        ))}
        
        {/* Availability requirement */}
        <div 
          className={cn(
            "flex items-center gap-2 text-xs transition-colors",
            normalizedValue.length < 3
              ? "text-muted-foreground"
              : isChecking
                ? "text-muted-foreground"
                : isAvailable === true
                  ? "text-green-600 dark:text-green-400"
                  : isAvailable === false
                    ? "text-destructive"
                    : "text-muted-foreground"
          )}
        >
          {normalizedValue.length < 3 ? (
            <div className="w-4 h-4 rounded-full border border-muted-foreground/50" />
          ) : isChecking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isAvailable === true ? (
            <Check className="w-4 h-4" />
          ) : isAvailable === false ? (
            <X className="w-4 h-4" />
          ) : (
            <div className="w-4 h-4 rounded-full border border-muted-foreground/50" />
          )}
          <span>Username chưa được sử dụng</span>
        </div>
      </div>
    </div>
  );
}
