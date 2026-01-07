import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Loader2, Mail, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailRequirement {
  id: string;
  label: string;
  met: boolean;
}

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (isValid: boolean, isAvailable: boolean | null, isChecking: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  mode?: 'signup' | 'login';
}

// Email validation regex (practical)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DEBOUNCE_MS = 400;
const SUPABASE_URL = 'https://dgeadmmbkvcsgizsnbpi.supabase.co';

export function EmailInput({
  value,
  onChange,
  onValidityChange,
  disabled = false,
  required = true,
  mode = 'signup'
}: EmailInputProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checkedEmailsRef = useRef<Map<string, boolean>>(new Map());

  // Normalize email
  const normalizedValue = useMemo(() => value.trim().toLowerCase(), [value]);

  // Check if normalized is different from input
  const wasNormalized = value !== normalizedValue && value.length > 0;

  // Get requirements
  const getRequirements = useCallback((email: string): EmailRequirement[] => {
    const normalized = email.trim().toLowerCase();
    return [
      {
        id: 'format',
        label: 'Địa chỉ email hợp lệ',
        met: EMAIL_REGEX.test(normalized)
      }
    ];
  }, []);

  const requirements = useMemo(() => getRequirements(value), [value, getRequirements]);
  const isFormatValid = requirements.every(r => r.met);

  // Check availability via API
  const checkAvailability = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase();
    
    // Skip if already checked
    if (checkedEmailsRef.current.has(normalized)) {
      setIsAvailable(checkedEmailsRef.current.get(normalized)!);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/check-email?e=${encodeURIComponent(normalized)}`
      );
      
      const data = await response.json();

      if (data.success && data.valid) {
        checkedEmailsRef.current.set(normalized, data.available);
        setIsAvailable(data.available);
        if (!data.available) {
          setErrorMessage('Email này đã được đăng ký');
        }
      } else if (data.error === 'RATE_LIMITED') {
        setErrorMessage('Quá nhiều yêu cầu, vui lòng thử lại sau');
        setIsAvailable(null);
      } else {
        setIsAvailable(null);
      }
    } catch (error) {
      console.error('Email check failed:', error);
      setIsAvailable(null);
      setErrorMessage('Không thể kiểm tra email');
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Debounced availability check
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only check availability in signup mode
    if (mode !== 'signup') {
      setIsAvailable(null);
      setIsChecking(false);
      return;
    }

    if (!normalizedValue || !isFormatValid) {
      setIsAvailable(null);
      setIsChecking(false);
      setErrorMessage(null);
      return;
    }

    // Check cache first
    if (checkedEmailsRef.current.has(normalizedValue)) {
      setIsAvailable(checkedEmailsRef.current.get(normalizedValue)!);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    debounceTimerRef.current = setTimeout(() => {
      checkAvailability(normalizedValue);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [normalizedValue, isFormatValid, checkAvailability, mode]);

  // Notify parent of validity changes
  useEffect(() => {
    if (onValidityChange) {
      onValidityChange(isFormatValid, isAvailable, isChecking);
    }
  }, [isFormatValid, isAvailable, isChecking, onValidityChange]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // Determine status icon
  const getStatusIcon = () => {
    if (!normalizedValue || !isFormatValid) return null;
    
    if (mode !== 'signup') return null;

    if (isChecking) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }

    if (isAvailable === true) {
      return <Check className="h-4 w-4 text-green-500" />;
    }

    if (isAvailable === false) {
      return <X className="h-4 w-4 text-destructive" />;
    }

    return null;
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="email">
        Email {required && <span className="text-destructive">*</span>}
      </Label>
      
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id="email"
          type="email"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          placeholder="email@example.com"
          className={cn(
            "pl-10 pr-10",
            isAvailable === false && "border-destructive focus-visible:ring-destructive"
          )}
          autoComplete="email"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {getStatusIcon()}
        </div>
      </div>

      {/* Normalization notice */}
      {wasNormalized && normalizedValue && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Sẽ được lưu dưới dạng: <span className="font-mono">{normalizedValue}</span>
        </p>
      )}

      {/* Availability status */}
      {mode === 'signup' && normalizedValue && isFormatValid && (
        <div className="text-xs">
          {isChecking && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang kiểm tra...
            </span>
          )}
          {!isChecking && isAvailable === true && (
            <span className="text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Email khả dụng
            </span>
          )}
          {!isChecking && isAvailable === false && (
            <span className="text-destructive flex items-center gap-1">
              <X className="h-3 w-3" />
              {errorMessage || 'Email đã được đăng ký'}
            </span>
          )}
          {!isChecking && isAvailable === null && errorMessage && (
            <span className="text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errorMessage}
            </span>
          )}
        </div>
      )}

      {/* Requirements checklist */}
      {mode === 'signup' && value && (
        <div className="space-y-1 pt-1">
          {requirements.map((req) => (
            <div
              key={req.id}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                req.met ? "text-green-600" : "text-muted-foreground"
              )}
            >
              {req.met ? (
                <Check className="h-3 w-3 flex-shrink-0" />
              ) : (
                <X className="h-3 w-3 flex-shrink-0" />
              )}
              <span>{req.label}</span>
            </div>
          ))}
          {isFormatValid && !isChecking && isAvailable !== null && (
            <div
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                isAvailable ? "text-green-600" : "text-destructive"
              )}
            >
              {isAvailable ? (
                <Check className="h-3 w-3 flex-shrink-0" />
              ) : (
                <X className="h-3 w-3 flex-shrink-0" />
              )}
              <span>Email chưa được đăng ký</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
