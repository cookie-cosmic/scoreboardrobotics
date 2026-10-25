import { AlertTriangle, CheckCircle2, ChevronRight, Flag, History, Pause, Play, RotateCcw, Square, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { calculateRulePoints, formatClock, timerDisplayMs } from '../lib/scoring';
import type { Match, ScoringRule } from '../lib/types';

function useClock(match: Match) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(id); }, []);
  return formatClock(timerDisplayMs(match.timer, now));
}

export function MatchConsole({ match, rules, onScore, onTimer, onUndo }: {
  match: Match; rules: ScoringRule[];
  onScore: (rule: ScoringRule, alliance: 'red' | 'blue') => void;
  onTimer: (command: 'start' | 'pause' | 'resume' | 'stop' | 'reset') => void;
  onUndo: () => void;
}) {
  const [alliance, setAlliance] = useState<'red' | 'blue'>('red');
  const [showConfirm, setShowConfirm] = useState<ScoringRule | null>(null);
  const clock = useClock(match);
  const redTeams = match.participants.filter((p) => p.alliance === 'red');
  const blueTeams = match.participants.filter((p) => p.alliance === 'blue');
  const eligibleRules = useMemo(() => rules.filter((r) => r.isActive && (r.allowedPeriods.includes('any') || r.allowedPeriods.includes('final') || r.allowedPeriods.includes(match.timer.activePeriodKey))), [rules, match.timer.activePeriodKey]);
  const send = (rule: ScoringRule) => {
    if (rule.confirmationRequired) setShowConfirm(rule); else onScore(rule, alliance);
  };
  return <>
    <section className="score-layout" aria-label="Match control console">
      <div className="grid" style={{ gap: 15 }}>
        <div className="alliance-card red"><div className="alliance-name"><span>Red alliance</span><button className="button ghost small" onClick={() => setAlliance('red')}>{alliance === 'red' ? 'Scoring' : 'Select'}</button></div><div className="score-number">{match.redScore}</div>{redTeams.map((p) => <div key={p.id} className="team-pill"><span>{p.team?.number}</span><span>{p.team?.name}</span></div>)}</div>
        <div className="alliance-card blue"><div className="alliance-name"><span>Blue alliance</span><button className="button ghost small" onClick={() => setAlliance('blue')}>{alliance === 'blue' ? 'Scoring' : 'Select'}</button></div><div className="score-number">{match.blueScore}</div>{blueTeams.map((p) => <div key={p.id} className="team-pill"><span>{p.team?.number}</span><span>{p.team?.name}</span></div>)}</div>
      </div>
      <div className="card timer-panel">
        <div className="period-pill">{match.timer.activePeriodKey.replace('_', ' ')}</div>
        <div className="clock" aria-live="polite">{clock}</div>
        <span className={`status ${match.timer.status}`}>{match.timer.status}</span>
        <div className="timer-controls">
          {match.timer.status === 'running' ? <button className="button secondary" onClick={() => onTimer('pause')}><Pause size={16}/> Pause</button> : <button className="button primary" onClick={() => onTimer(match.timer.status === 'paused' ? 'resume' : 'start')}><Play size={16}/> {match.timer.status === 'paused' ? 'Resume' : 'Start'}</button>}
          <button className="button secondary" onClick={() => onTimer('stop')}><Square size={14}/> Stop</button>
          <button className="button ghost" onClick={() => onTimer('reset')}><RotateCcw size={15}/> Reset</button>
        </div>
        <p className="helper"><CheckCircle2 size={13} style={{ verticalAlign: 'text-bottom', color: 'var(--green)' }}/> Server-timestamped timer • version {match.timer.version}</p>
      </div>
      <div className="card card-pad"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><h3 className="card-title"><History size={15} style={{ verticalAlign: 'text-bottom', marginRight: 7 }}/>Activity</h3><p className="card-meta">Authoritative event ledger</p></div><button className="button ghost small" onClick={onUndo} disabled={!match.events.length}><Undo2 size={14}/> Undo</button></div>
        <div className="event-list" style={{ marginTop: 12 }}>{match.events.length ? match.events.slice(0, 6).map((event) => <div className="event" key={event.id}><span className="event-dot" style={{ background: event.alliance === 'red' ? 'var(--red)' : event.alliance === 'blue' ? 'var(--blue)' : 'var(--amber)' }}/><div><h4>{event.reason || event.eventType}</h4><p>{event.actorLabel} · {new Date(event.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div><strong>{event.pointsAwarded >= 0 ? '+' : ''}{event.pointsAwarded}</strong></div>) : <div className="empty">No confirmed scoring events yet.</div>}</div>
      </div>
    </section>
    <section className="card card-pad" style={{ marginTop: 15 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 15, gap: 15 }}><div><p className="eyebrow">{alliance} selected</p><h2 className="card-title" style={{ fontSize: 17 }}>Quick scoring actions</h2></div><span className="helper">Every action is validated before it is saved.</span></div><div className="rule-buttons">{eligibleRules.map((rule) => <button className="rule-button" key={rule.id} style={{ '--rule': rule.buttonColor } as CSSProperties} onClick={() => send(rule)}><span className="points">+{calculateRulePoints(rule, rule.quantityIncrement)}</span><span className="label">{rule.buttonLabel}</span><span className="unit">{rule.quantityIncrement} {rule.unitLabel}</span></button>)}</div></section>
    {showConfirm && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="confirm-heading"><div className="modal"><p className="eyebrow">Confirm accountable action</p><h2 id="confirm-heading">Apply {showConfirm.displayName}?</h2><p className="page-subtitle">This action is recorded with your account and should include a reason in a live competition.</p><div className="banner" style={{ marginTop: 16 }}><AlertTriangle size={18}/><span>In production, correction reasons are mandatory and the original event is retained.</span></div><footer><button className="button secondary" onClick={() => setShowConfirm(null)}>Cancel</button><button className="button primary" onClick={() => { onScore(showConfirm, alliance); setShowConfirm(null); }}><Flag size={14}/> Confirm</button></footer></div></div>}
  </>;
}
