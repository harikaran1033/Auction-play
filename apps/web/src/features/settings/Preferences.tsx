import { useState } from "react";
import { PageTitle } from "../../components/common";
import { useAuth, supabase } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { usePreferences } from "../../lib/preferences";
import { AudioSettings } from "../audio/AudioSettings";
import { ThemePicker } from "../../components/ThemePicker";
export function Preferences() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [message, setMessage] = useState("");
  const [motion, setMotion] = useState(
    localStorage.getItem("cricket-motion") ?? "system",
  );
  async function save() {
    localStorage.setItem("cricket-motion", motion);
    document.documentElement.dataset.motion = motion;
    usePreferences.getState().setMotion(motion);
    if (supabase) {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: name },
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      useAuth.setState({ user: { ...user!, name } });
    }
    setMessage("Preferences saved.");
  }
  return (
    <>
      <PageTitle
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your clubhouse settings."
        description="A few preferences to make auction night yours."
      />
      <section className="panel preferences">
        <fieldset className="preference-group">
          <legend>01 / Your profile</legend>
          <label>
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              disabled={!supabase}
            />
          </label>
          {!supabase && (
            <small className="muted">
              Local account names are chosen at registration.
            </small>
          )}
        </fieldset>
        <fieldset className="preference-group">
          <legend>02 / Display & motion</legend>
          <ThemePicker />
          <label>
            Animation preferences
            <select value={motion} onChange={(e) => setMotion(e.target.value)}>
              <option value="system">Follow device settings</option>
              <option value="reduce">Reduce motion</option>
            </select>
          </label>
        </fieldset>
        <fieldset className="preference-group">
          <legend>03 / Sound & voice</legend>
          <AudioSettings />
          <p className="muted">
            Voice always starts muted. Join and unmute explicitly in each room.
          </p>
        </fieldset>
        <Button onClick={save}>Save preferences</Button>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
      </section>
    </>
  );
}
