'use client';

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin"; 

interface Face { id: number; boundingBox: { x: number; y: number; width: number; height: number }; person?: { name: string; } }
interface Photo { id: number; url: string; originalUrl?: string; status: string; faces?: Face[]; }
interface Person { id: number; name: string; phoneNumber: string; seatNumber?: string; }

export default function PhotographerPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 📝 增加 'stats' 分頁
  const [activeTab, setActiveTab] = useState<'photos' | 'guests' | 'stats'>('photos');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [guests, setGuests] = useState<Person[]>([]);
  const [stats, setStats] = useState({ totalPhotos: 0, totalDownloads: 0, totalShares: 0 });
  
  const [uploading, setUploading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', seat: '' });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadAllPhotos();
      loadAllGuests();
      loadStats(); // 登入時載入數據
    } else { setErrorMsg('密碼錯誤'); setPasswordInput(''); }
  };

  const loadAllPhotos = () => { fetch(`${BACKEND_URL}/photos`).then(res => res.json()).then(data => { if (Array.isArray(data)) setPhotos(data); }); };
  const loadAllGuests = () => { fetch(`${BACKEND_URL}/guests`).then(res => res.json()).then(data => { if (Array.isArray(data)) setGuests(data); }); };
  
  // 📊 載入數據函式
  const loadStats = () => { 
      fetch(`${BACKEND_URL}/analytics/stats`)
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(console.error); 
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    socket.on('new_photo_ready', (newPhoto: Photo) => { setPhotos(prev => [newPhoto, ...prev.filter(p => p.id !== newPhoto.id)]); loadStats(); });
    socket.on('photo_deleted', (id: number) => { setPhotos(prev => prev.filter(p => p.id !== id)); loadStats(); });
    return () => { socket.off('new_photo_ready'); socket.off('photo_deleted'); };
  }, [isAuthenticated]);

  const executeDeletePhoto = async () => {
    if (!deleteTargetId) return;
    try {
        const res = await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
        if (res.ok) { setDeleteTargetId(null); } else { alert("刪除失敗"); }
    } catch (err) { alert('連線錯誤'); }
  };

  const handleDeleteGuest = async (id: number, name: string) => {
    if (!confirm(`確定要刪除賓客「${name}」嗎？`)) return;
    try { const res = await fetch(`${BACKEND_URL}/guest/${id}`, { method: 'DELETE' }); if (res.ok) setGuests(prev => prev.filter(g => g.id !== id)); } catch (err) { alert('連線錯誤'); }
  };

  const downloadTemplate = () => {
    const csvContent = "\uFEFFphone,name,seat\n85291234567,陳大文,Table 1";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "template.csv";
    link.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    const options = { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true, initialQuality: 0.8 };
    for (let i = 0; i < e.target.files.length; i++) {
        const originalFile = e.target.files[i];
        try {
            const compressedFile = await imageCompression(originalFile, options);
            const finalFile = new File([compressedFile], originalFile.name, { type: compressedFile.type, lastModified: Date.now() });
            const formData = new FormData();
            formData.append('photo', finalFile);
            await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });
        } catch (error) {
            const formData = new FormData();
            formData.append('photo', originalFile);
            await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });
        }
    }
    setUploading(false);
    loadAllPhotos();
    loadStats(); // 上傳後更新數據
    e.target.value = ''; 
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuest.phone) return alert("電話是必填的");
    try {
        await fetch(`${BACKEND_URL}/upsert-guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGuest.name, phone: newGuest.phone, seatNumber: newGuest.seat }) });
        setNewGuest({ name: '', phone: '', seat: '' });
        loadAllGuests(); 
    } catch (err) { alert("連線錯誤"); }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async (results) => {
            const parsedData = results.data;
            if (parsedData.length === 0) return alert("CSV 是空的！");
            const formattedGuests = parsedData.map((row: any) => ({ name: row.name || row.Name || row.姓名 || '', phone: row.phone || row.Phone || row.電話 || '', seatNumber: row.seat || row.Seat || row.座位 || '' })).filter((g: any) => g.phone); 
            if (!confirm(`⚠️ 這將【清空】舊資料並匯入 ${formattedGuests.length} 筆新名單。確定嗎？`)) return;
            try {
                const res = await fetch(`${BACKEND_URL}/upsert-guests-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guests: formattedGuests }) });
                if (res.ok) { alert(`🎉 成功匯入！`); loadAllGuests(); }
            } catch (err) { alert(`上傳失敗`); }
            e.target.value = ''; 
        }
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl text-center space-y-4">
          <h2 className="text-xl font-bold text-white">攝影師後台</h2>
          <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="密碼" className="w-full px-4 py-2 rounded bg-slate-900 text-white" />
          {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded font-bold">解鎖</button>
        </form>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex w-full md:w-auto justify-between md:justify-start items-center gap-4">
             <h1 className="text-2xl font-bold text-white shrink-0">工作台</h1>
             <div className="flex bg-slate-900 rounded p-1 shrink-0">
                <button onClick={() => setActiveTab('photos')} className={`px-3 py-1 text-sm rounded transition ${activeTab==='photos'?'bg-blue-600 text-white':'text-slate-400'}`}>照片</button>
                <button onClick={() => setActiveTab('guests')} className={`px-3 py-1 text-sm rounded transition ${activeTab==='guests'?'bg-blue-600 text-white':'text-slate-400'}`}>名單</button>
                {/* 🌟 新增數據 Tab */}
                <button onClick={() => { setActiveTab('stats'); loadStats(); }} className={`px-3 py-1 text-sm rounded transition ${activeTab==='stats'?'bg-blue-600 text-white':'text-slate-400'}`}>數據</button>
             </div>
          </div>

          {activeTab === 'photos' && (
             <div className="flex w-full md:w-auto justify-between md:justify-end gap-3">
                <div className="flex bg-slate-900 rounded p-1 text-xs shrink-0">
                    <button onClick={() => setViewMode('original')} className={`px-3 py-2 rounded ${viewMode==='original'?'bg-slate-700 text-white':'text-slate-500'}`}>原圖</button>
                    <button onClick={() => setViewMode('framed')} className={`px-3 py-2 rounded ${viewMode==='framed'?'bg-slate-700 text-white':'text-slate-500'}`}>合成</button>
                </div>
                <label className={`flex-1 md:flex-none cursor-pointer flex items-center justify-center px-4 py-2 bg-green-600 rounded text-white font-bold text-sm hover:bg-green-500 transition ${uploading?'opacity-50':''}`}>
                    {uploading ? '...' : '＋ 上傳'}
                    <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
             </div>
          )}
        </header>

        {activeTab === 'photos' && (
            <div className="columns-2 md:columns-4 lg:columns-5 gap-4 space-y-4 mx-auto">
            {photos.map(photo => (
                <div key={photo.id} className="break-inside-avoid group bg-slate-900 rounded-lg overflow-hidden border border-slate-800 mb-4">
                    <div className="relative w-full"> 
                        <img src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url} className="w-full h-auto block" loading="lazy" alt={`Photo ${photo.id}`} />
                        {/* 🟩 綠色 AI 框框 (現在後端有修復了，這裡應該會顯示) */}
                        {photo.faces?.map((face, i) => (
                            <div key={i} style={{ position: 'absolute', left: `${face.boundingBox.x * 100}%`, top: `${face.boundingBox.y * 100}%`, width: `${face.boundingBox.width * 100}%`, height: `${face.boundingBox.height * 100}%`, border: '2px solid #00ff00', boxShadow: '0 0 5px #00ff00' }}>
                                {face.person && <div className="absolute -top-6 left-0 bg-green-600 text-white text-[10px] px-1 rounded whitespace-nowrap z-10">{face.person.name}</div>}
                            </div>
                        ))}
                        <button onClick={() => setDeleteTargetId(photo.id)} className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition z-20">🗑️</button>
                    </div> 
                </div>
            ))}
            </div>
        )}

        {activeTab === 'guests' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group">
                        <button onClick={downloadTemplate} className="absolute top-4 right-4 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300">下載範本</button>
                        <h3 className="text-lg font-bold text-white mb-2">CSV 匯入</h3>
                        <p className="text-xs text-slate-400 mb-4">⚠️ 上傳將會<span className="text-red-400 font-bold">清空舊名單</span></p>
                        <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800/50 transition"><span className="text-sm font-bold text-blue-400">📁 點擊上傳 CSV</span><input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" /></label>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl sticky top-4">
                        <h3 className="text-lg font-bold text-white mb-4">＋ 單筆新增</h3>
                        <form onSubmit={handleAddGuest} className="space-y-4">
                            <div><label className="text-xs text-slate-500 uppercase font-bold">電話</label><input type="text" value={newGuest.phone} onChange={e => setNewGuest({...newGuest, phone: e.target.value})} placeholder="91234567" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none"/></div>
                            <div><label className="text-xs text-slate-500 uppercase font-bold">姓名</label><input type="text" value={newGuest.name} onChange={e => setNewGuest({...newGuest, name: e.target.value})} placeholder="陳大文" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none"/></div>
                            <div><label className="text-xs text-slate-500 uppercase font-bold text-yellow-500">座位號</label><input type="text" value={newGuest.seat} onChange={e => setNewGuest({...newGuest, seat: e.target.value})} placeholder="Table 5" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none"/></div>
                            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition">儲存</button>
                        </form>
                    </div>
                </div>
                <div className="md:col-span-2">
                     <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400 text-sm">已匯入名單 ({guests.length} 人)</span>
                            <button onClick={loadAllGuests} className="text-xs text-blue-400 hover:text-blue-300">↻ 重新整理</button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0 z-10">
                                    <tr><th className="p-4">姓名</th><th className="p-4">電話</th><th className="p-4">座位</th><th className="p-4 text-right">操作</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {guests.map(g => (
                                        <tr key={g.id} className="hover:bg-slate-800/50 transition">
                                            <td className="p-4 font-bold text-white">{g.name || '-'}</td><td className="p-4 text-slate-400 font-mono">{g.phoneNumber}</td><td className="p-4 text-yellow-500 font-bold">{g.seatNumber || '-'}</td>
                                            <td className="p-4 text-right"><button onClick={() => handleDeleteGuest(g.id, g.name || g.phoneNumber)} className="text-slate-600 hover:text-red-500 transition px-2 py-1">🗑️</button></td>
                                        </tr>
                                    ))}
                                    {guests.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-slate-500">尚無資料</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* 📊 新增的數據顯示區塊 */}
        {activeTab === 'stats' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
                    <h3 className="text-slate-400 text-sm uppercase mb-2">總照片數</h3>
                    <p className="text-4xl font-bold text-white">{stats.totalPhotos}</p>
                </div>
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
                    <h3 className="text-slate-400 text-sm uppercase mb-2">總下載次數</h3>
                    <p className="text-4xl font-bold text-green-400">{stats.totalDownloads}</p>
                </div>
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
                    <h3 className="text-slate-400 text-sm uppercase mb-2">總分享次數</h3>
                    <p className="text-4xl font-bold text-blue-400">{stats.totalShares}</p>
                </div>
            </div>
        )}

      </div>
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded text-center border border-slate-700">
                <h3 className="text-white mb-4 text-lg">刪除此照片？</h3>
                <div className="flex gap-4 justify-center">
                    <button onClick={() => setDeleteTargetId(null)} className="px-6 py-2 bg-slate-600 rounded text-white hover:bg-slate-500">取消</button>
                    <button onClick={executeDeletePhoto} className="px-6 py-2 bg-red-600 rounded text-white hover:bg-red-500">確認</button>
                </div>
            </div>
        </div>
      )}
    </main>
  );
}