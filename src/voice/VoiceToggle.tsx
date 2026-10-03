import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '../components/ui/primitives';
import { cx } from '../lib/format';
import type { VoiceController } from './useVoice';

/** Small equalizer shown while a line is being spoken. */
export function SpeakingBars({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex h-3.5 items-end gap-[2px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] animate-pulse rounded-full bg-current"
          style={{ height: `${[60, 100, 75][i]}%`, animationDelay: `${i * 0.15}s`, animationDuration: '0.7s' }}
        />
      ))}
    </span>
  );
}

export function VoiceToggle({ voice }: { voice: VoiceController }) {
  const unavailable = voice.enabled && voice.status === 'unavailable';
  return (
    <div className="flex items-center gap-2">
      {unavailable && (
        <span className="hidden font-mono text-[11px] uppercase tracking-wider text-zinc-500 lg:inline" title={voice.issue ?? undefined}>
          Voice unavailable
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => voice.setEnabled(!voice.enabled)}
        aria-pressed={voice.enabled}
        aria-label={voice.enabled ? 'Voice on. Turn voice off' : 'Voice off. Turn voice on'}
        data-voice-clip={voice.currentClipId ?? ''}
        className={cx(voice.enabled && !unavailable && 'border-gold-400/70 text-gold-300')}
      >
        {voice.enabled ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}
        <span className="hidden sm:inline">Voice {voice.enabled ? 'on' : 'off'}</span>
        {voice.speaking && voice.enabled && <SpeakingBars className="text-gold-300" />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {voice.speaking && voice.currentClipId ? 'Audio playing' : ''}
      </span>
    </div>
  );
}
