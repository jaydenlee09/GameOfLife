import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal, Plus } from 'lucide-react';
import flameIcon from '../../assets/flame_icon.png';
import { getHabitStreak } from '../../utils/habitUtils';

/** Today's habits as tappable chips, each with a View details / Edit / Delete menu. */
const HabitChecklist = ({ habits, todayKey, onToggleHabitDay, onViewHabit, onEditHabit, onDeleteHabit, onAddHabit }) => {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const openMenu = useCallback((habitId, e) => {
    if (openMenuId === habitId) {
      setOpenMenuId(null);
      return;
    }
    setMenuAnchor(e.currentTarget.getBoundingClientRect());
    setOpenMenuId(habitId);
  }, [openMenuId]);

  // Close the open habit's menu on any outside click, or on scroll (the menu is
  // portaled with fixed positioning, so it won't track the button on scroll).
  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = () => setOpenMenuId(null);
    const handleClickOutside = (e) => {
      if (!e.target.closest('.habit-checkin-menu') && !e.target.closest('.habit-checkin-menu-btn')) closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', closeMenu, true);
    };
  }, [openMenuId]);

  return (
    <>
      <div className="habit-checkin-list">
        {habits.map(h => {
          const done = !!h.history?.[todayKey];
          const streak = getHabitStreak(h);
          const menuOpen = openMenuId === h.id;
          return (
            <div key={h.id} className={`habit-checkin-row ${done ? 'done' : ''}`}>
              <button className="habit-checkin-toggle" onClick={() => onToggleHabitDay && onToggleHabitDay(h.id, todayKey)}>
                <span className="habit-checkin-check">{done && <Check size={13} strokeWidth={3} />}</span>
                <span className="habit-checkin-name">{h.name}</span>
              </button>
              <div className="habit-checkin-meta">
                {streak > 0 && (
                  <span className="habit-checkin-streak" title={`${streak}-day streak`}>
                    <img src={flameIcon} alt="" className="habit-checkin-streak-icon" />
                    {streak}
                  </span>
                )}
                <button
                  className="habit-checkin-menu-btn"
                  onClick={(e) => openMenu(h.id, e)}
                  aria-label={`More actions for ${h.name}`}
                  aria-expanded={menuOpen}
                >
                  <MoreHorizontal size={14} />
                </button>
                {menuOpen && menuAnchor && createPortal(
                  <div
                    className="habit-checkin-menu"
                    role="menu"
                    style={{ top: menuAnchor.bottom + 4, left: Math.min(menuAnchor.right - 140, window.innerWidth - 148) }}
                  >
                    <button role="menuitem" onClick={() => { onViewHabit(h); setOpenMenuId(null); }}>View details</button>
                    <button role="menuitem" onClick={() => { onEditHabit(h); setOpenMenuId(null); }}>Edit</button>
                    <button role="menuitem" className="habit-checkin-menu-danger" onClick={() => { setOpenMenuId(null); onDeleteHabit(h.id); }}>
                      Delete
                    </button>
                  </div>,
                  document.body
                )}
              </div>
            </div>
          );
        })}
        <button className="habit-checkin-add-row" onClick={() => onAddHabit()}>
          <Plus size={14} strokeWidth={2.5} /> Add a habit
        </button>
      </div>
      {habits.length === 0 && <p className="checkin-health-empty">No habits yet — add one to start tracking.</p>}
    </>
  );
};

export default HabitChecklist;
