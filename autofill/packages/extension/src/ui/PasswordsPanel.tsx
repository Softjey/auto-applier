import { useState, useSyncExternalStore } from 'react';
import type { PasswordController } from '../passwords/controller';
import { useDock } from './dock';

/**
 * The password manager's widget: a sidebar that pushes the page right (the form filler owns the
 * right side). Inside an iframe it cannot move the page, so it floats bottom-left instead.
 */
export function PasswordsPanel({ controller }: { controller: PasswordController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState);
  const [open, setOpen] = useState(true);
  const docked = window === window.top;
  const showsPanel = !s.prompt && open && !(s.offline && !s.notice) && !!(s.form || s.notice);
  useDock('left', docked && showsPanel);

  if (!s.form && !s.prompt && !s.notice) return null;

  if (s.prompt) {
    return (
      <aside className="pw-panel" aria-label="Applier Passwords" data-testid="pw-prompt">
        <strong>{s.prompt.mode === 'new' ? 'Save password?' : 'Update saved password?'}</strong>
        <p className="pw-note">
          {s.prompt.login} on {s.prompt.host}
        </p>
        <div className="pw-actions">
          <button className="pw-go" onClick={() => void controller.savePrompt()}>
            {s.prompt.mode === 'new' ? 'Save' : 'Update'}
          </button>
          <button onClick={() => void controller.dismissPrompt()}>Not now</button>
          <button onClick={() => void controller.dismissPrompt(true)}>Never for this site</button>
        </div>
      </aside>
    );
  }

  if (!open || (s.offline && !s.notice)) {
    return (
      <button
        className="pw-fab"
        onClick={() => setOpen(true)}
        aria-label="Open Applier Passwords"
        title={s.offline ? 'Applier server is not running' : 'Applier Passwords'}
      >
        {s.offline ? '!' : 'P'}
      </button>
    );
  }

  // An unconfirmed entry is the draft this very panel just made: not "an account you already have".
  const exact = s.matches.filter((m) => m.level === 'exact' && m.verified);
  return (
    <aside className={docked ? 'pw-panel pw-docked' : 'pw-panel'} aria-label="Applier Passwords">
      <header>
        <strong>Applier Passwords</strong>
        <button className="pw-x" onClick={() => setOpen(false)} aria-label="Minimise">
          ×
        </button>
      </header>
      <p className="pw-note">{s.host}</p>

      {s.form === 'signup' ? (
        <section>
          {exact.length > 0 && (
            <p className="pw-note">
              You already have an account here ({exact[0]?.login}). Use the sign-in form instead, or
              create a new one below.
            </p>
          )}
          <button
            className="pw-go"
            disabled={s.busy}
            onClick={() => void controller.createAccount()}
          >
            {s.busy ? 'Working…' : 'Create account'}
          </button>
          <p className="pw-note">
            Generates a password, saves it, fills your e-mail and details. You press the site&apos;s
            own button.
          </p>
          {s.signup && (
            <div className="pw-report" data-testid="pw-signup">
              <p>
                <strong>{s.signup.filled}</strong> filled for {s.signup.login}
                {s.signup.ticked.length > 0 && ` · ticked: ${s.signup.ticked.join('; ')}`}
              </p>
              {s.signup.manual.length > 0 && (
                <>
                  <h4>Needs you ({s.signup.manual.length})</h4>
                  <ul>
                    {s.signup.manual.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="pw-actions">
                <button
                  disabled={s.busy}
                  onClick={() => void controller.createAccount({ regenerate: true })}
                >
                  New password
                </button>
                <button
                  disabled={s.busy}
                  onClick={() =>
                    void controller.createAccount({ regenerate: true, alphanumeric: true })
                  }
                >
                  Letters &amp; digits only
                </button>
              </div>
            </div>
          )}
        </section>
      ) : s.form ? (
        <section>
          {s.matches.length === 0 ? (
            <p className="pw-note">
              No saved login for this site. After you sign in it will offer to save it.
            </p>
          ) : (
            <ul className="pw-logins">
              {s.matches.map((m) => (
                <li key={m.id}>
                  <button
                    className="pw-go"
                    disabled={s.busy}
                    onClick={() => void controller.fillWith(m.id)}
                    aria-label={`Fill login ${m.login}`}
                  >
                    Fill login
                  </button>{' '}
                  <span>{m.login}</span>{' '}
                  <em>
                    {m.level === 'related' ? `(from ${m.domain}) ` : ''}
                    {m.verified ? '' : 'unconfirmed'}
                  </em>
                  <button
                    className="pw-x"
                    aria-label={`Forget ${m.login}`}
                    onClick={() => void controller.forget(m.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {s.notice && (
        <p className={s.notice.kind === 'error' ? 'pw-err' : 'pw-note'}>{s.notice.text}</p>
      )}

      <details className="pw-settings">
        <summary>Settings</summary>
        <label>
          <input
            type="checkbox"
            checked={s.settings.autoFill}
            onChange={(e) => void controller.setSetting({ autoFill: e.target.checked })}
          />{' '}
          Fill a sign-in by itself when one login fits
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.settings.autoSave}
            onChange={(e) => void controller.setSetting({ autoSave: e.target.checked })}
          />{' '}
          Save new logins without asking
        </label>
      </details>
    </aside>
  );
}
