import React, { useState } from 'react';
import './ShopPage.css';

const PRIORITY_OPTIONS = ['low', 'medium', 'high'];

const fetchPreviewImage = async (url) => {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    return data?.data?.image?.url || data?.data?.logo?.url || '';
  } catch {
    return '';
  }
};

const ShopPage = ({ shop = { items: [] }, setShop }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [fetchingImageFor, setFetchingImageFor] = useState(null);
  const [manualImageEditId, setManualImageEditId] = useState(null);
  const [manualImageValue, setManualImageValue] = useState('');

  const items = shop.items || [];
  const totalUnpurchased = items.filter(i => !i.purchased).reduce((s, i) => s + (Number(i.price) || 0), 0);

  const resetForm = () => {
    setNewName('');
    setNewPrice('');
    setNewUrl('');
    setNewImageUrl('');
    setNewCategory('');
    setNewPriority('medium');
    setShowAdd(false);
  };

  const setItemImage = (id, imageUrl) => {
    if (!imageUrl) return;
    setShop(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, imageUrl } : i),
    }));
  };

  const handleAddItem = () => {
    if (!newName.trim()) return;
    const id = Date.now().toString();
    const url = newUrl.trim();
    const imageUrl = newImageUrl.trim();
    const item = {
      id,
      name: newName.trim(),
      price: Number(newPrice) || 0,
      url,
      imageUrl,
      category: newCategory.trim(),
      priority: newPriority,
      purchased: false,
      createdAt: Date.now(),
    };
    setShop(prev => ({ ...prev, items: [item, ...(prev.items || [])] }));
    resetForm();

    if (!imageUrl && url) fetchPreviewImage(url).then(fetched => setItemImage(id, fetched));
  };

  const handleFetchImage = async (item) => {
    if (!item.url || fetchingImageFor) return;
    setFetchingImageFor(item.id);
    const imageUrl = await fetchPreviewImage(item.url);
    setItemImage(item.id, imageUrl);
    setFetchingImageFor(null);
  };

  const handleSetManualImage = (id) => {
    const trimmed = manualImageValue.trim();
    if (trimmed) setItemImage(id, trimmed);
    setManualImageEditId(null);
    setManualImageValue('');
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
            <input className="shop-input" placeholder="Link / URL (optional — used to fetch a preview image)" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
            <input className="shop-input" placeholder="Image URL (optional — overrides auto-fetch)" value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} />
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
              {item.imageUrl && (
                <img
                  className="shop-item-image"
                  src={item.imageUrl}
                  alt={item.name}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
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
              {!item.imageUrl && manualImageEditId !== item.id && (
                <div className="shop-image-actions">
                  {item.url && (
                    <button
                      className="shop-fetch-image-btn"
                      onClick={() => handleFetchImage(item)}
                      disabled={fetchingImageFor === item.id}
                    >
                      {fetchingImageFor === item.id ? 'Fetching…' : '+ Fetch image'}
                    </button>
                  )}
                  <button
                    className="shop-fetch-image-btn"
                    onClick={() => { setManualImageEditId(item.id); setManualImageValue(''); }}
                  >
                    + Add image
                  </button>
                </div>
              )}
              {manualImageEditId === item.id && (
                <div className="shop-image-manual-row">
                  <input
                    className="shop-input shop-input--sm"
                    placeholder="Image URL"
                    value={manualImageValue}
                    onChange={e => setManualImageValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSetManualImage(item.id)}
                    autoFocus
                  />
                  <button className="shop-fetch-image-btn" onClick={() => handleSetManualImage(item.id)}>Set</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShopPage;
