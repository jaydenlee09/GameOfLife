import React, { useState } from 'react';
import './ShopPage.css';

const PRIORITY_OPTIONS = ['low', 'medium', 'high'];

const ShopPage = ({ shop = { items: [] }, setShop }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPriority, setNewPriority] = useState('medium');

  const items = shop.items || [];
  const totalUnpurchased = items.filter(i => !i.purchased).reduce((s, i) => s + (Number(i.price) || 0), 0);

  const resetForm = () => {
    setNewName('');
    setNewPrice('');
    setNewUrl('');
    setNewCategory('');
    setNewPriority('medium');
    setShowAdd(false);
  };

  const handleAddItem = () => {
    if (!newName.trim()) return;
    const item = {
      id: Date.now().toString(),
      name: newName.trim(),
      price: Number(newPrice) || 0,
      url: newUrl.trim(),
      category: newCategory.trim(),
      priority: newPriority,
      purchased: false,
      createdAt: Date.now(),
    };
    setShop(prev => ({ ...prev, items: [item, ...(prev.items || [])] }));
    resetForm();
  };

  const handleDeleteItem = (id) => {
    setShop(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const handleTogglePurchased = (id) => {
    setShop(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, purchased: !i.purchased } : i),
    }));
  };

  return (
    <div className="shop-page">
      <div className="shop-content">
        <h1 className="section-page-title">SHOP</h1>

        <div className="shop-header">
          <div className="shop-total-display">
            <span className="shop-total-label">WISHLIST TOTAL</span>
            <span className="shop-total-value">${totalUnpurchased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <button className="shop-add-btn" onClick={() => setShowAdd(o => !o)}>
            {showAdd ? '✕ Cancel' : '+ Add Item'}
          </button>
        </div>

        {showAdd && (
          <div className="shop-add-form">
            <input className="shop-input" placeholder="Item name (e.g. Noise-cancelling headphones)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
            <div className="shop-form-row">
              <input className="shop-input shop-input--sm" type="number" min="0" step="0.01" placeholder="Price ($)" value={newPrice} onChange={e => setNewPrice(e.target.value)} />
              <input className="shop-input shop-input--sm" placeholder="Category (optional)" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
            </div>
            <input className="shop-input" placeholder="Link / URL (optional)" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
            <div className="shop-priority-row">
              <span className="shop-priority-label">Priority:</span>
              <div className="shop-priority-pills">
                {PRIORITY_OPTIONS.map(p => (
                  <button key={p} className={`shop-priority-pill shop-priority-pill--${p} ${newPriority === p ? 'active' : ''}`} onClick={() => setNewPriority(p)}>{p}</button>
                ))}
              </div>
            </div>
            <button className="shop-confirm-btn" onClick={handleAddItem} disabled={!newName.trim()}>Add to Wishlist</button>
          </div>
        )}

        {items.length === 0 && !showAdd && (
          <div className="shop-empty">
            <p className="shop-empty-title">Your wishlist is empty</p>
            <p className="shop-empty-sub">Add things you want to buy and keep track of them here.</p>
            <button className="shop-add-btn" onClick={() => setShowAdd(true)}>+ Add Your First Item</button>
          </div>
        )}

        <div className="shop-grid">
          {items.map(item => (
            <div key={item.id} className={`shop-card ${item.purchased ? 'purchased' : ''}`}>
              <button className="shop-delete" onClick={() => handleDeleteItem(item.id)} title="Remove">✕</button>
              <label className="shop-checkbox-row">
                <input type="checkbox" checked={item.purchased} onChange={() => handleTogglePurchased(item.id)} />
                <span className="shop-checkbox-label">Purchased</span>
              </label>
              <h3 className="shop-item-name">{item.name}</h3>
              <div className="shop-item-meta">
                <span className="shop-item-price">${Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className={`shop-item-priority shop-item-priority--${item.priority}`}>{item.priority}</span>
                {item.category && <span className="shop-item-category">{item.category}</span>}
              </div>
              {item.url && (
                <a className="shop-item-link" href={item.url} target="_blank" rel="noopener noreferrer">View item ↗</a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShopPage;
