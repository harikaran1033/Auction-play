import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import {
  useAuctionAudio,
  enableAudio,
  previewAuctionAudio,
} from "../../lib/auctionAudio";
import { Button } from "../../components/ui/button";
export function AudioSettings() {
  const { options, unlocked, error, setOptions } = useAuctionAudio();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const load = () =>
      setVoices(
        speechSynthesis.getVoices().filter((voice) => /^en/i.test(voice.lang)),
      );
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return (
    <div className="audio-settings">
      <p>
        Choose the sound of your auction. These controls affect only your device
        and save immediately.
      </p>
      <label className="audio-toggle">
        <input
          type="checkbox"
          checked={options.enabled}
          onChange={(event) => {
            setOptions({ enabled: event.target.checked });
            enableAudio();
          }}
        />
        <span>
          <strong>Enable auction audio</strong>
          <small>
            Turn off to silence all auction effects and announcements.
          </small>
        </span>
      </label>
      <fieldset disabled={!options.enabled}>
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={options.timer}
            onChange={(event) => setOptions({ timer: event.target.checked })}
          />
          <span>
            <strong>Countdown sound</strong>
            <small>
              Final ten-second ticks; going once at five and going twice at two.
            </small>
          </span>
        </label>
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={options.results}
            onChange={(event) => setOptions({ results: event.target.checked })}
          />
          <span>
            <strong>Sold / unsold sounds</strong>
            <small>Gavel effects and confirmed auction results.</small>
          </span>
        </label>
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={options.announcer}
            onChange={(event) =>
              setOptions({ announcer: event.target.checked })
            }
          />
          <span>
            <strong>Spoken auctioneer</strong>
            <small>
              Use a voice available on your device for calls and results.
            </small>
          </span>
        </label>
        <label className="audio-volume">
          Volume <output>{Math.round(options.volume * 100)}%</output>
          <input
            aria-label="Auction volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(options.volume * 100)}
            onChange={(event) =>
              setOptions({ volume: Number(event.target.value) / 100 })
            }
          />
        </label>
        {voices.length > 0 && (
          <label>
            Auctioneer voice
            <select
              value={options.voiceURI}
              onChange={(event) => setOptions({ voiceURI: event.target.value })}
            >
              <option value="">Device default English voice</option>
              {voices.map((voice) => (
                <option value={voice.voiceURI} key={voice.voiceURI}>
                  {voice.name} · {voice.lang}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
      <Button
        variant="secondary"
        disabled={!options.enabled}
        onClick={previewAuctionAudio}
      >
        <Volume2 size={16} />
        Test auction audio
      </Button>
      {options.enabled && !unlocked && (
        <p className="muted">Tap Test auction audio to allow playback.</p>
      )}
      {error && (
        <p role="status" className="notice">
          {error}
        </p>
      )}
    </div>
  );
}
