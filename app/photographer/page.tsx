'use client';

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Papa from 'papaparse';

// 👇 請確認後端網址
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

const ADMIN_PASSWORD = "admin"; 

interface Photo { id: number; url: string; originalUrl?: string; status: string; }
interface Person { id: number; name: string; phoneNumber: string; seatNumber?: string; }

export default function PhotographerPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 頁面模式: 'photos' | 'guests'
  const [activeTab, setActiveTab] = useState<'photos' | 'guests'>('photos');

  // 資料狀態
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [guests, setGuests] = useState<Person[]>([]);
  
  // 上傳/輸入狀態
  const [uploading, setUploading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');

  // 新增賓客表單
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', seat: '' });

  // ----------------------------------------------------
  // 1. 登入邏輯
  // ----------------------------------------------------
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadAllPhotos();
      loadAllGuests();
    } else {
      setErrorMsg('密碼錯誤');
      setPasswordInput('');
    }
  };

  // ----------------------------------------------------
  // 2. 資料載入
  // ----------------------------------------------------
  const loadAllPhotos = () => {
    fetch(`${BACKEND_URL}/photos`).then(res => res.json()).then(data => {
      if (Array.isArray(data)) setPhotos(data);
    }).catch(console.error);
  };

  const loadAllGuests = () => {
    fetch(`${BACKEND_URL}/guests`).then(res => res.json()).then(data => {
      if (Array.isArray(data)) setGuests(data);
    }).catch(console.error);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    socket.on('new_photo_ready', (newPhoto: Photo) => {
        setPhotos(prev => [newPhoto, ...prev.filter(p => p.id !== newPhoto.id)]);
    });
    socket.on('photo_deleted', (id: number) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
    });
    return () => { socket.off('new_photo_ready'); socket.off('photo_deleted'); };
  }, [isAuthenticated]);

  // ----------------------------------------------------
  // 3. 操作邏輯
  // ----------------------------------------------------
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    for (let i = 0; i < e.target.files.length; i++) {
        const formData = new FormData();
        formData.append('photo', e.target.files[i]);
        await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData }).catch(console.error);
    }
    setUploading(false);
    loadAllPhotos();
    e.target.value = ''; 
  };

  const executeDelete = async () => {
    if (deleteTargetId) {
        await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
        setDeleteTargetId(null);
    }
  };

  // 新增/更新賓客
  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuest.phone) return alert("電話是必填的");

    try {
        const res = await fetch(`${BACKEND_URL}/upsert-guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newGuest.name,
                phone: newGuest.phone,
                seatNumber: newGuest.seat
            })
        });
        if (res.ok) {
            setNewGuest({ name: '', phone: '', seat: '' });
            loadAllGuests(); // 重新整理列表
        } else {
            alert("新增失敗");
        }
    } catch (err) { alert("連線錯誤"); }
  };

  // 📂 處理 CSV 上傳
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
        header: true, // 告訴它第一行是標題 (Name, Phone, Seat)
        skipEmptyLines: true,
        complete: async (results) => {
            const parsedData = results.data;
            
            // 簡單的格式檢查
            if (parsedData.length === 0) return alert("CSV 是空的！");
            
            // 轉換資料格式 (適應 Excel 輸出的欄位名)
            // 假設 CSV 標題是: name, phone, seat
            const formattedGuests = parsedData.map((row: any) => ({
                name: row.name || row.Name || row.姓名 || '',
                phone: row.phone || row.Phone || row.電話 || '',
                seatNumber: row.seat || row.Seat || row.座位 || row.seatNumber
            })).filter((g: any) => g.phone); // 過濾掉沒電話的無效行

            if (formattedGuests.length === 0) return alert("找不到有效的資料，請確認 CSV 欄位名稱為: phone, name, seat");

            if (!confirm(`準備匯入 ${formattedGuests.length} 筆資料，確定嗎？`)) return;

            try {
                const res = await fetch(`${BACKEND_URL}/upsert-guests-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ guests: formattedGuests })
                });
                
                if (res.ok) {
                    alert(`🎉 成功匯入 ${formattedGuests.length} 筆資料！`);
                    loadAllGuests(); 
                } else {
                    // 👇 讀取後端回傳的錯誤文字
                    const errorText = await res.text();
                    alert(`匯入失敗 (Server Error): ${errorText}`);
                }
            } catch (err: any) {
                console.error(err);
                alert(`上傳失敗: ${err.message || "未知錯誤"}`);
            }
            
            e.target.value = ''; // 清空 input 讓下次能再選同個檔案
        },
        error: (error) => {
            alert("CSV 解析失敗：" + error.message);
        }
    });
  };

  // ----------------------------------------------------
  // 🔐 登入畫面
  // ----------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
          <h2 className="text-xl font-bold text-white mb-6">攝影師後台</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password" 
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setErrorMsg(''); }}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
            {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition">解鎖</button>
          </form>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 🎛️ 管理介面
  // ----------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-950 p-6 md:p-8 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        
        {/* Header & Tabs */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
          <div className="flex items-center gap-6">
             <h1 className="text-2xl font-bold text-white">攝影師工作台</h1>
             <nav className="flex bg-slate-900 p-1 rounded-lg">
                <button 
                    onClick={() => setActiveTab('photos')}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab==='photos'?'bg-blue-600 text-white':'text-slate-400 hover:text-white'}`}
                >
                    📸 照片管理
                </button>
                <button 
                    onClick={() => setActiveTab('guests')}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab==='guests'?'bg-blue-600 text-white':'text-slate-400 hover:text-white'}`}
                >
                    📋 賓客名單 (座位)
                </button>
             </nav>
          </div>
          
          {activeTab === 'photos' && (
             <div className="flex gap-4">
                <div className="flex bg-slate-900 p-1 rounded-lg">
                    <button onClick={() => setViewMode('original')} className={`px-3 py-1 text-xs font-bold rounded ${viewMode==='original'?'bg-slate-700 text-white':'text-slate-500'}`}>原圖</button>
                    <button onClick={() => setViewMode('framed')} className={`px-3 py-1 text-xs font-bold rounded ${viewMode==='framed'?'bg-slate-700 text-white':'text-slate-500'}`}>合成</button>
                </div>
                <label className={`cursor-pointer px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold text-sm flex items-center gap-2 ${uploading ? 'opacity-50' : ''}`}>
                    {uploading ? '上傳中...' : '＋ 上傳照片'}
                    <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
             </div>
          )}
        </header>

        {/* 📸 TAB: 照片列表 */}
        {activeTab === 'photos' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {photos.map(photo => (
                <div key={photo.id} className="relative group bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
                <img 
                    src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url}
                    className="w-full aspect-[2/3] object-cover"
                    loading="lazy"
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => setDeleteTargetId(photo.id)} className="p-2 bg-red-600 text-white rounded-full shadow-lg">🗑️</button>
                </div>
                </div>
            ))}
            </div>
        )}

        {/* 📋 TAB: 賓客名單管理 */}
        {activeTab === 'guests' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* 左邊：操作區 */}
                <div className="md:col-span-1 space-y-6">
                    
                    {/* 👇 新增：CSV 批量匯入區塊 */}
                    <div className="bg-gradient-to-br from-green-900/50 to-emerald-900/50 border border-green-700/50 p-6 rounded-2xl">
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Excel / CSV 批量匯入
                        </h3>
                        <p className="text-xs text-green-200 mb-4 leading-relaxed">
                            請上傳 .csv 檔案。表格第一行標題請設為：<br/>
                            <code className="bg-black/30 px-1 py-0.5 rounded text-green-300">phone</code>, <code className="bg-black/30 px-1 py-0.5 rounded text-green-300">name</code>, <code className="bg-black/30 px-1 py-0.5 rounded text-green-300">seat</code>
                        </p>
                        <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-green-600/50 rounded-xl cursor-pointer hover:bg-green-600/20 transition group">
                            <div className="text-center">
                                <span className="text-sm font-bold text-green-400 group-hover:text-green-300">點擊選擇檔案</span>
                            </div>
                            <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                        </label>
                    </div>

                    {/* 單筆新增表單 */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl sticky top-4">
                        <h3 className="text-lg font-bold text-white mb-4">＋ 單筆新增</h3>
                        <form onSubmit={handleAddGuest} className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-500 uppercase font-bold">電話 (必填)</label>
                                <input 
                                    type="text" 
                                    value={newGuest.phone}
                                    onChange={e => setNewGuest({...newGuest, phone: e.target.value})}
                                    placeholder="+85212345678"
                                    className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 uppercase font-bold">姓名</label>
                                <input 
                                    type="text" 
                                    value={newGuest.name}
                                    onChange={e => setNewGuest({...newGuest, name: e.target.value})}
                                    placeholder="陳大文"
                                    className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 uppercase font-bold text-yellow-500">座位號</label>
                                <input 
                                    type="text" 
                                    value={newGuest.seat}
                                    onChange={e => setNewGuest({...newGuest, seat: e.target.value})}
                                    placeholder="Table 5"
                                    className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-yellow-500 focus:outline-none font-bold"
                                />
                            </div>
                            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition">
                                儲存
                            </button>
                        </form>
                    </div>
                </div>

                {/* 右邊：名單列表 */}
                <div className="md:col-span-2">
                     <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400 text-sm">已匯入名單 ({guests.length} 人)</span>
                            <button onClick={loadAllGuests} className="text-xs text-blue-400 hover:text-blue-300">↻ 重新整理</button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-4">姓名</th>
                                        <th className="p-4">電話</th>
                                        <th className="p-4">座位號</th>
                                        <th className="p-4 text-right">狀態</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {guests.map(g => (
                                        <tr key={g.id} className="hover:bg-slate-800/50 transition">
                                            <td className="p-4 font-bold text-white">{g.name || '-'}</td>
                                            <td className="p-4 text-slate-400 font-mono">{g.phoneNumber}</td>
                                            <td className="p-4">
                                                {g.seatNumber ? (
                                                    <span className="bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded text-sm font-bold border border-yellow-500/30">
                                                        {g.seatNumber}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600 text-sm">未安排</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="text-green-500 text-xs">● 待命</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {guests.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-12 text-center text-slate-500">
                                                尚無資料，請使用 CSV 匯入。
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>

      {/* 刪除 Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl text-center">
            <h3 className="text-white font-bold mb-4">確定刪除？</h3>
            <div className="flex gap-2">
                <button onClick={() => setDeleteTargetId(null)} className="px-4 py-2 bg-slate-600 rounded text-white">取消</button>
                <button onClick={executeDelete} className="px-4 py-2 bg-red-600 rounded text-white">確認</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}