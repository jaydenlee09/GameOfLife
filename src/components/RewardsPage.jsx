import React, { useState } from 'react';
import './RewardsPage.css';

const XP_COST_OPTIONS = [100, 250, 500, 1000, 2500, 5000];

const RewardsPage = ({ rewards = { items: [], redemptions: [] }, setRewards, userXp = 0, onAddXp }) => {
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newCost, setNewCost]   = useState(500);
  const [newDesc, setNewDesc]   = useState('');
  const [redeeming, setRedeeming] = useState(null);
  const [toast, setToast]       = useState(null);

  const totalXpSpent = rewards.redemptions.reduce((s, r) => s + r.xpSpent, 0);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleAddReward = () => {
    if (!newName.trim()) return;
    const item = { id: Date.now().toString(), name: newName.trim(), xpCost: newCost, description: newDesc.trim(), createdAt: Date.now() };
    setRewards(prev => ({ ...prev, items: [...(prev.items || []), item] }));
    setNewName('');
    setNewDesc('');
    setShowAdd(false);
  };

  const handleDeleteReward = (id) => {
    setRewards(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const handleRedeem = (item) => {
    if (userXp < item.xpCost) { showToast(`Need ${item.xpCost - userXp} more XP`); return; }
    setRedeeming(item);
  };

  const confirmRedeem = () => {
    if (!redeeming) return;
    onAddXp(-redeeming.xpCost, { source: 'manual', label: `Reward: ${redeeming.name}` });
    setRewards(prev => ({
      ...prev,
      redemptions: [{ id: Date.now().toString(), rewardId: redeeming.id, redeemedAt: Date.now(), xpSpent: redeeming.xpCost, name: redeeming.name }, ...(prev.redemptions || [])],
    }));
    showToast(`🎉 Enjoy your reward!`);
    setRedeeming(null);
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="rewards-page">
      <h1 className="section-page-title">REWARDS SHOP</h1>

      <div className="rewards-layout">
        {/* ── Shop ─────────────────────────────────────────────────────────── */}
        <div className="rewards-main">
          <div className="rewards-header">
            <div className="rewards-xp-display">
              <span className="rewards-xp-label">AVAILABLE XP</span>
              <span className="rewards-xp-value">{userXp.toLocaleString()}</span>
            </div>
            <button className="rewards-add-btn" onClick={() => setShowAdd(o => !o)}>
              {showAdd ? '✕ Cancel' : '+ Add Reward'}
            </button>
          </div>

          {showAdd && (
            <div className="rewards-add-form">
              <input className="rewards-input" placeholder="Reward name (e.g. Order sushi 🍣)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddReward()} />
              <input className="rewards-input rewards-input--sm" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              <div className="rewards-cost-row">
                <span className="rewards-cost-label">XP Cost:</span>
                <div className="rewards-cost-pills">
                  {XP_COST_OPTIONS.map(c => (
                    <button key={c} className={`rewards-cost-pill ${newCost === c ? 'active' : ''}`} onClick={() => setNewCost(c)}>{c.toLocaleString()}</button>
                  ))}
                </div>
              </div>
              <button className="rewards-confirm-btn" onClick={handleAddReward} disabled={!newName.trim()}>Create Reward</button>
            </div>
          )}

          {rewards.items?.length === 0 && !showAdd && (
            <div className="rewards-empty">
              <p className="rewards-empty-title">Your shop is empty</p>
              <p className="rewards-empty-sub">Add real-world rewards to spend your hard-earned XP on. Make them meaningful!</p>
              <button className="rewards-add-btn" onClick={() => setShowAdd(true)}>+ Add Your First Reward</button>
            </div>
          )}

          <div className="rewards-grid">
            {(rewards.items || []).map(item => {
              const canAfford = userXp >= item.xpCost;
              return (
                <div key={item.id} className={`reward-card ${!canAfford ? 'locked' : ''}`}>
                  <button className="reward-delete" onClick={() => handleDeleteReward(item.id)} title="Remove">✕</button>
                  <div className="reward-cost">
                    <span className="reward-cost-icon">⚡</span>
                    <span className="reward-cost-val">{item.xpCost.toLocaleString()} XP</span>
                  </div>
                  <h3 className="reward-name">{item.name}</h3>
                  {item.description && <p className="reward-desc">{item.description}</p>}
                  <button
                    className={`reward-redeem-btn ${canAfford ? '' : 'disabled'}`}
                    onClick={() => handleRedeem(item)}
                    disabled={!canAfford}
                  >
                    {canAfford ? 'Redeem' : `Need ${(item.xpCost - userXp).toLocaleString()} more XP`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── History ──────────────────────────────────────────────────────── */}
        <div className="rewards-sidebar">
          <h3 className="rewards-sidebar-title">REDEMPTION HISTORY</h3>
          <div className="rewards-xp-spent">
            <span className="rewards-spent-label">Total XP spent</span>
            <span className="rewards-spent-value">{totalXpSpent.toLocaleString()}</span>
          </div>
          {rewards.redemptions?.length === 0 ? (
            <p className="rewards-sidebar-empty">Nothing redeemed yet.</p>
          ) : (
            <div className="rewards-history-list">
              {(rewards.redemptions || []).slice(0, 20).map(r => (
                <div key={r.id} className="rewards-history-item">
                  <span className="rewards-history-name">{r.name}</span>
                  <span className="rewards-history-cost">-{r.xpSpent.toLocaleString()} XP</span>
                  <span className="rewards-history-date">{formatDate(r.redeemedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {redeeming && (
        <div className="rewards-confirm-overlay" onClick={() => setRedeeming(null)}>
          <div className="rewards-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="rewards-confirm-title">Redeem Reward?</h3>
            <p className="rewards-confirm-name">{redeeming.name}</p>
            <p className="rewards-confirm-cost">This will deduct <strong>{redeeming.xpCost.toLocaleString()} XP</strong> from your balance.</p>
            <div className="rewards-confirm-btns">
              <button className="rewards-confirm-yes" onClick={confirmRedeem}>Yes, redeem!</button>
              <button className="rewards-confirm-no"  onClick={() => setRedeeming(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="rewards-toast">{toast}</div>}
    </div>
  );
};

export default RewardsPage;
