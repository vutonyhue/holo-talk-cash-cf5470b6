import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialPadButton } from './DialPadButton';
import { Phone, Video, Delete, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialPadProps {
  onCall: (phoneNumber: string, callType: 'voice' | 'video') => void;
  onClose: () => void;
  isSearching?: boolean;
}

const dialPadKeys = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '+', letters: '' },
  { digit: '0', letters: '' },
  { digit: '⌫', letters: '' },
];

export const DialPad = ({ onCall, onClose, isSearching }: DialPadProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleDigitPress = (digit: string) => {
    if (digit === '⌫') {
      setPhoneNumber(prev => prev.slice(0, -1));
    } else {
      setPhoneNumber(prev => prev + digit);
    }
  };

  const formatPhoneDisplay = (phone: string): string => {
    // Simple formatting for display
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+84')) {
      const rest = cleaned.slice(3);
      return `+84 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`.trim();
    }
    if (cleaned.startsWith('0')) {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`.trim();
    }
    return cleaned;
  };

  const canCall = phoneNumber.replace(/[^\d]/g, '').length >= 9;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Gọi bằng số điện thoại</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Phone number display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        <div className="min-h-[48px] flex items-center">
          <span className={cn(
            "text-3xl font-light tracking-wide text-center",
            !phoneNumber && "text-muted-foreground"
          )}>
            {phoneNumber ? formatPhoneDisplay(phoneNumber) : 'Nhập số điện thoại'}
          </span>
        </div>

        {/* Dial pad */}
        <div className="grid grid-cols-3 gap-4">
          {dialPadKeys.map((key) => (
            <DialPadButton
              key={key.digit}
              digit={key.digit}
              letters={key.letters}
              onClick={handleDigitPress}
              className={key.digit === '⌫' ? 'text-destructive' : undefined}
            />
          ))}
        </div>

        {/* Call buttons */}
        <div className="flex items-center gap-4 mt-4">
          <Button
            size="lg"
            variant="outline"
            className="w-16 h-16 rounded-full border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            disabled={!canCall || isSearching}
            onClick={() => onCall(phoneNumber, 'voice')}
          >
            {isSearching ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Phone className="w-6 h-6" />
            )}
          </Button>
          
          <Button
            size="lg"
            className="w-20 h-20 rounded-full bg-primary hover:bg-primary/90"
            disabled={!canCall || isSearching}
            onClick={() => onCall(phoneNumber, 'video')}
          >
            {isSearching ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Video className="w-8 h-8" />
            )}
          </Button>
          
          <Button
            size="lg"
            variant="outline"
            className="w-16 h-16 rounded-full"
            onClick={() => setPhoneNumber('')}
            disabled={!phoneNumber}
          >
            <Delete className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};
